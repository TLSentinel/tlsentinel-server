package routes

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	httpSwagger "github.com/swaggo/http-swagger"

	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/certificates"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/handlers"
	"github.com/tlsentinel/tlsentinel-server/internal/hosts"
	"github.com/tlsentinel/tlsentinel-server/internal/logger"
	"github.com/tlsentinel/tlsentinel-server/internal/mail"
	"github.com/tlsentinel/tlsentinel-server/internal/oidc"
	"github.com/tlsentinel/tlsentinel-server/internal/probe"
	"github.com/tlsentinel/tlsentinel-server/internal/scanners"
	"github.com/tlsentinel/tlsentinel-server/internal/settings"
	"github.com/tlsentinel/tlsentinel-server/internal/users"
	"github.com/tlsentinel/tlsentinel-server/internal/utils"
	tlsetinelWeb "github.com/tlsentinel/tlsentinel-server/web"
)

// RegisterRoutes builds and returns the root HTTP handler.
// It reads OIDC configuration from the environment directly; the /auth/oidc/*
// routes are omitted when OIDC is not configured.
func RegisterRoutes(store *db.Store, cfg *config.Config) (http.Handler, error) {

	jwtCfg := &auth.JWTConfig{
		SecretKey: []byte(cfg.JWTSecret),
		TTL:       24 * time.Hour,
	}

	oidcHandler, err := buildOIDCHandler(context.Background(), store, jwtCfg)
	if err != nil {
		return nil, err
	}

	r := chi.NewRouter()

	tokenHandler := scanners.NewHandler(store)
	certHandler := certificates.NewHandler(store)
	settingsHandler := settings.NewHandler(store)
	hostHandler := hosts.NewHandler(store)
	authHandler := auth.NewHandler(store, jwtCfg)
	userHandler := users.NewHandler(store)
	utilsHandler := utils.NewHandler()
	scannerHandler := probe.NewHandler(store)
	mailHandler := mail.NewHandler(store, cfg)

	r.Use(middleware.RequestID)
	r.Use(logger.RequestLogger)
	r.Use(middleware.Recoverer)

	r.Get("/api-docs/*", httpSwagger.WrapHandler)

	r.Route("/api/v1", func(r chi.Router) {

		// Public routes
		r.Get("/health", handlers.Health)
		r.Get("/version", handlers.Version)
		r.Post("/auth/login", authHandler.Login)

		// Auth capability discovery — lets the frontend show/hide SSO options.
		r.Get("/auth/config", func(w http.ResponseWriter, r *http.Request) {
			type authConfig struct {
				OIDCEnabled bool `json:"oidcEnabled"`
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(authConfig{OIDCEnabled: oidcHandler != nil}) //nolint:errcheck
		})

		// OIDC routes — only registered when OIDC is configured.
		if oidcHandler != nil {
			r.Get("/auth/oidc/login", oidcHandler.Login)
			r.Get("/auth/oidc/callback", oidcHandler.Callback)
		}

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(auth.Authenticate(store, jwtCfg))

			r.Route("/scanners", func(r chi.Router) {
				r.Get("/", tokenHandler.List)
				r.Post("/", tokenHandler.Create)
				r.Route("/{scannerID}", func(r chi.Router) {
					r.Put("/", tokenHandler.Update)
					r.Delete("/", tokenHandler.Delete)
					r.Post("/default", tokenHandler.SetDefault)
				})
			})
			r.Route("/alerts", func(r chi.Router) {
				// TODO IGNORE FOR NOW
			})

			r.Route("/certificates", func(r chi.Router) {
				r.Get("/", certHandler.List)
				r.Post("/", certHandler.Create)
				r.Get("/active", certHandler.Active)
				r.Get("/expiring", certHandler.Expiring)
				r.Route("/{fingerprint}", func(r chi.Router) {
					r.Get("/", certHandler.Get)
					r.Delete("/", certHandler.Delete)
					r.Get("/hosts", certHandler.GetHosts)
				})
			})

			r.Route("/hosts", func(r chi.Router) {
				r.Get("/", hostHandler.List)
				r.Post("/", hostHandler.Create)
				r.Route("/{hostID}", func(r chi.Router) {
					r.Get("/", hostHandler.Get)
					r.Put("/", hostHandler.Update)
					r.Delete("/", hostHandler.Delete)
					r.Get("/tls-profile", hostHandler.GetTLSProfile)
					r.Get("/history", hostHandler.History)
				})
			})

			r.Route("/users", func(r chi.Router) {
				r.Get("/", userHandler.List)
				r.Post("/", userHandler.Create)
				r.Route("/{userID}", func(r chi.Router) {
					r.Get("/", userHandler.Get)
					r.Put("/", userHandler.Update)
					r.Delete("/", userHandler.Delete)
					r.Patch("/password", userHandler.ChangePassword)
				})
			})

			r.Route("/settings", func(r chi.Router) {
				r.Route("/mail", func(r chi.Router) {
					r.Get("/", mailHandler.Get)
					r.Put("/", mailHandler.Save)
					r.Post("/test", mailHandler.Test)
				})
				r.Get("/alert-thresholds", settingsHandler.GetAlertThresholds)
				r.Put("/alert-thresholds", settingsHandler.SetAlertThresholds)
			})

			r.Route("/utils", func(r chi.Router) {
				r.Get("/resolve", utilsHandler.Resolve)
			})

			r.Route("/probe", func(r chi.Router) {
				r.Use(probe.RequireScanner)
				r.Get("/config", scannerHandler.Config)
				r.Get("/hosts", scannerHandler.Hosts)
				r.Post("/hosts/{hostID}/result", scannerHandler.Result)
				r.Post("/hosts/{hostID}/tls-profile", scannerHandler.TLSProfile)
			})
		})

	})

	// Serve embedded frontend with SPA fallback — any path that isn't a real
	// static asset gets index.html so React Router handles it client-side.
	distFS, _ := fs.Sub(tlsetinelWeb.FS, "dist")
	fileServer := http.FileServer(http.FS(distFS))
	r.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f, err := distFS.Open(r.URL.Path[1:]) // strip leading /
		if err != nil {
			// Not a real file — serve index.html and let React Router handle it.
			r.URL.Path = "/"
		} else {
			f.Close()
		}
		fileServer.ServeHTTP(w, r)
	}))

	return r, nil
}

// buildOIDCHandler reads OIDC config from the environment and returns an
// initialised handler. Returns (nil, nil) when OIDC is not configured.
func buildOIDCHandler(ctx context.Context, store *db.Store, jwtCfg *auth.JWTConfig) (*oidc.Handler, error) {
	issuer := os.Getenv("TLSENTINEL_OIDC_ISSUER")
	if issuer == "" {
		return nil, nil
	}

	clientID := os.Getenv("TLSENTINEL_OIDC_CLIENT_ID")
	clientSecret := os.Getenv("TLSENTINEL_OIDC_CLIENT_SECRET")
	redirectURL := os.Getenv("TLSENTINEL_OIDC_REDIRECT_URL")
	if clientID == "" || clientSecret == "" || redirectURL == "" {
		return nil, fmt.Errorf("TLSENTINEL_OIDC_ISSUER is set but CLIENT_ID, CLIENT_SECRET, or REDIRECT_URL is missing")
	}

	var scopes []string
	if s := os.Getenv("TLSENTINEL_OIDC_SCOPES"); s != "" {
		scopes = strings.Fields(s)
	}

	cfg := oidc.Config{
		Issuer:        issuer,
		ClientID:      clientID,
		ClientSecret:  clientSecret,
		RedirectURL:   redirectURL,
		Scopes:        scopes,
		DefaultRole:   os.Getenv("TLSENTINEL_OIDC_DEFAULT_ROLE"),
		UsernameClaim: os.Getenv("TLSENTINEL_OIDC_USERNAME_CLAIM"),
	}

	return oidc.NewHandler(ctx, store, jwtCfg, cfg)
}
