package oidc

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	gooidc "github.com/coreos/go-oidc/v3/oidc"
	"go.uber.org/zap"
	"golang.org/x/oauth2"

	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
)

const (
	stateCookieName = "oidc_state"
	stateCookieTTL  = 10 * time.Minute
)

// Config holds the OIDC provider configuration loaded from environment variables.
type Config struct {
	Issuer        string
	ClientID      string
	ClientSecret  string
	RedirectURL   string
	Scopes        []string // defaults to [openid profile email]
	
	UsernameClaim string   // ID token claim used as username (default: upn)
}

// Handler handles the OIDC login and callback flows.
type Handler struct {
	store    *db.Store
	jwtCfg   *auth.JWTConfig
	provider *gooidc.Provider
	oauth2   oauth2.Config
	cfg      Config
	log      *zap.Logger
}

// NewHandler initialises the OIDC provider and returns a ready Handler.
// Returns (nil, nil) when OIDC is not configured in appCfg.
// It contacts the issuer's discovery endpoint, so it requires network access.
func NewHandler(ctx context.Context, store *db.Store, jwtCfg *auth.JWTConfig, appCfg *config.Config) (*Handler, error) {
	if !appCfg.OIDCEnabled {
		return nil, nil
	}

	provider, err := gooidc.NewProvider(ctx, appCfg.OIDCIssuer)
	if err != nil {
		return nil, fmt.Errorf("oidc: failed to discover provider %q: %w", appCfg.OIDCIssuer, err)
	}

	var scopes []string
	if appCfg.OIDCScopes != "" {
		scopes = strings.Fields(appCfg.OIDCScopes)
	}
	if len(scopes) == 0 {
		scopes = []string{gooidc.ScopeOpenID, "profile", "email"}
	}

	cfg := Config{
		Issuer:        appCfg.OIDCIssuer,
		ClientID:      appCfg.OIDCClientID,
		ClientSecret:  appCfg.OIDCClientSecret,
		RedirectURL:   appCfg.OIDCRedirectURL,
		UsernameClaim: appCfg.OIDCUsernameClaim,
	}

	return &Handler{
		store:  store,
		jwtCfg: jwtCfg,
		cfg:    cfg,
		log:    zap.L().With(zap.String("component", "oidc")),
		provider: provider,
		oauth2: oauth2.Config{
			ClientID:     appCfg.OIDCClientID,
			ClientSecret: appCfg.OIDCClientSecret,
			RedirectURL:  appCfg.OIDCRedirectURL,
			Endpoint:     provider.Endpoint(),
			Scopes:       scopes,
		},
	}, nil
}

// Login redirects the browser to the provider's authorization endpoint.
//
// @Summary      OIDC login
// @Description  Redirects to the configured OIDC provider to begin authentication
// @Tags         auth
// @Success      302
// @Router       /auth/oidc/login [get]
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	state, err := randomState()
	if err != nil {
		http.Error(w, "failed to generate state", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     stateCookieName,
		Value:    state,
		Path:     "/",
		MaxAge:   int(stateCookieTTL.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
	})

	http.Redirect(w, r, h.oauth2.AuthCodeURL(state), http.StatusFound)
}

// Callback handles the provider redirect, validates the ID token, upserts
// the user, issues a TLSentinel JWT, and redirects the SPA to /auth/callback.
//
// @Summary      OIDC callback
// @Description  Handles the authorization code callback from the OIDC provider
// @Tags         auth
// @Success      302
// @Failure      400  {string}  string  "bad request"
// @Failure      500  {string}  string  "internal server error"
// @Router       /auth/oidc/callback [get]
func (h *Handler) Callback(w http.ResponseWriter, r *http.Request) {
	// --- CSRF state check ---
	cookie, err := r.Cookie(stateCookieName)
	if err != nil || cookie.Value == "" {
		http.Error(w, "missing state cookie", http.StatusBadRequest)
		return
	}
	if r.URL.Query().Get("state") != cookie.Value {
		http.Error(w, "state mismatch", http.StatusBadRequest)
		return
	}
	// Clear the state cookie.
	http.SetCookie(w, &http.Cookie{
		Name:     stateCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})

	// --- Exchange code for tokens ---
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing code", http.StatusBadRequest)
		return
	}

	oauth2Token, err := h.oauth2.Exchange(r.Context(), code)
	if err != nil {
		h.log.Error("token exchange failed", zap.Error(err))
		http.Error(w, "failed to exchange code", http.StatusInternalServerError)
		return
	}

	// --- Validate ID token ---
	rawIDToken, ok := oauth2Token.Extra("id_token").(string)
	if !ok {
		h.log.Error("id_token missing from provider response")
		http.Error(w, "missing id_token in response", http.StatusInternalServerError)
		return
	}

	verifier := h.provider.Verifier(&gooidc.Config{ClientID: h.oauth2.ClientID})
	idToken, err := verifier.Verify(r.Context(), rawIDToken)
	if err != nil {
		h.log.Warn("id_token verification failed", zap.Error(err))
		http.Error(w, "invalid id_token", http.StatusUnauthorized)
		return
	}

	// --- Extract claims ---
	var claims map[string]any
	if err := idToken.Claims(&claims); err != nil {
		h.log.Error("failed to parse id_token claims", zap.Error(err))
		http.Error(w, "failed to parse claims", http.StatusInternalServerError)
		return
	}

	username := h.extractUsername(claims, idToken.Subject)

	h.log.Info("oidc callback", zap.String("username", username))

	// --- Look up pre-provisioned user ---
	user, err := h.store.GetUserForOIDCLogin(r.Context(), username)
	if err != nil {
		h.log.Warn("oidc login rejected — user not found or disabled", zap.String("username", username))
		http.Error(w, "account not provisioned or disabled", http.StatusUnauthorized)
		return
	}

	// --- Issue our JWT ---
	token, err := h.jwtCfg.IssueToken(user.ID, user.Username, user.Role, user.FirstName, user.LastName)
	if err != nil {
		h.log.Error("failed to issue jwt", zap.Error(err))
		http.Error(w, "failed to issue token", http.StatusInternalServerError)
		return
	}

	// Redirect the SPA to the callback page with the token in the URL fragment
	// so it never appears in server logs or the Referrer header.
	http.Redirect(w, r, "/auth/callback#token="+token, http.StatusFound)
}

// extractUsername picks the best available claim for the username.
// Defaults to "upn" (Entra ID), falling back to "preferred_username" then "email".
func (h *Handler) extractUsername(claims map[string]any, fallback string) string {
	claim := h.cfg.UsernameClaim
	if claim == "" {
		claim = "upn"
	}
	for _, c := range []string{claim, "preferred_username", "email"} {
		if v := stringClaim(claims, c); v != "" {
			return v
		}
	}
	return fallback
}

// stringClaim returns the named claim as a plain string (used internally).
func stringClaim(claims map[string]any, key string) string {
	v, _ := claims[key].(string)
	return strings.TrimSpace(v)
}

func randomState() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
