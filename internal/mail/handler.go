package mail

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

var validAuthTypes = map[string]bool{"none": true, "plain": true, "login": true}
var validTLSModes = map[string]bool{"none": true, "starttls": true, "tls": true}

// Handler handles HTTP requests for the mail configuration endpoints.
type Handler struct {
	store         *db.Store
	encryptionKey []byte // nil when TLSENTINEL_ENCRYPTION_KEY is not set
}

// NewHandler creates a new Handler. encryptionKey may be nil if the key is not
// configured; in that case any attempt to store an SMTP password will be rejected.
func NewHandler(store *db.Store, encryptionKey []byte) *Handler {
	return &Handler{store: store, encryptionKey: encryptionKey}
}

// @Summary      Get mail config
// @Description  Returns the current SMTP / mail configuration. The password is never returned; passwordSet indicates whether one is stored.
// @Tags         settings,mail
// @Produce      json
// @Success      200  {object}  models.MailConfigResponse
// @Failure      500  {string}  string  "internal server error"
// @Router       /settings/mail [get]
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetMailConfig(r.Context())
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			// No config saved yet — return safe defaults so the UI can render.
			response.JSON(w, http.StatusOK, models.MailConfigResponse{
				SMTPPort: 587,
				AuthType: "plain",
				TLSMode:  "starttls",
			})
			return
		}
		http.Error(w, "failed to get mail config", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, cfg.ToResponse())
}

// saveRequest is the body shape for PUT /settings/mail.
type saveRequest struct {
	Enabled      bool   `json:"enabled"`
	SMTPHost     string `json:"smtpHost"`
	SMTPPort     int    `json:"smtpPort"`
	AuthType     string `json:"authType"`
	SMTPUsername string `json:"smtpUsername"`
	SMTPPassword string `json:"smtpPassword"` // empty string = keep existing password
	FromAddress  string `json:"fromAddress"`
	FromName     string `json:"fromName"`
	TLSMode      string `json:"tlsMode"`
}

// @Summary      Save mail config
// @Description  Creates or replaces the SMTP / mail configuration. Pass an empty smtpPassword to keep the existing password.
// @Tags         settings,mail
// @Accept       json
// @Produce      json
// @Param        request  body      saveRequest  true  "Mail config payload"
// @Success      200  {object}  models.MailConfigResponse
// @Failure      400  {string}  string  "invalid request"
// @Failure      422  {string}  string  "validation error (e.g. encryption key not set)"
// @Failure      500  {string}  string  "internal server error"
// @Router       /settings/mail [put]
func (h *Handler) Save(w http.ResponseWriter, r *http.Request) {
	var req saveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.SMTPPort <= 0 {
		req.SMTPPort = 587
	}
	if !validAuthTypes[req.AuthType] {
		http.Error(w, "authType must be none, plain, or login", http.StatusBadRequest)
		return
	}
	if !validTLSModes[req.TLSMode] {
		http.Error(w, "tlsMode must be none, starttls, or tls", http.StatusBadRequest)
		return
	}
	if req.AuthType != "none" && req.SMTPUsername == "" {
		http.Error(w, "smtpUsername is required when authType is not none", http.StatusBadRequest)
		return
	}

	// Resolve the stored password.
	encryptedPassword := ""
	if req.AuthType != "none" {
		if req.SMTPPassword != "" {
			// New password provided — encrypt it.
			if h.encryptionKey == nil {
				http.Error(w, "TLSENTINEL_ENCRYPTION_KEY is not set; cannot store SMTP password", http.StatusUnprocessableEntity)
				return
			}
			var err error
			encryptedPassword, err = crypto.Encrypt(h.encryptionKey, req.SMTPPassword)
			if err != nil {
				http.Error(w, "failed to encrypt password", http.StatusInternalServerError)
				return
			}
		} else {
			// No new password — carry over the existing encrypted value.
			existing, err := h.store.GetMailConfig(r.Context())
			if err != nil && !errors.Is(err, db.ErrNotFound) {
				http.Error(w, "failed to load existing config", http.StatusInternalServerError)
				return
			}
			encryptedPassword = existing.SMTPPassword
		}
	}

	cfg := models.MailConfig{
		Enabled:      req.Enabled,
		SMTPHost:     req.SMTPHost,
		SMTPPort:     req.SMTPPort,
		AuthType:     req.AuthType,
		SMTPUsername: req.SMTPUsername,
		SMTPPassword: encryptedPassword,
		FromAddress:  req.FromAddress,
		FromName:     req.FromName,
		TLSMode:      req.TLSMode,
	}

	if err := h.store.UpsertMailConfig(r.Context(), cfg); err != nil {
		http.Error(w, "failed to save mail config", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, cfg.ToResponse())
}

// testRequest is the optional body for POST /settings/mail/test.
type testRequest struct {
	To string `json:"to"` // recipient; falls back to from_address when empty
}

// @Summary      Send test email
// @Description  Sends a test email using the current saved SMTP configuration. The optional `to` field sets the recipient; when omitted the from_address is used.
// @Tags         settings,mail
// @Accept       json
// @Param        request  body  testRequest  false  "Optional recipient override"
// @Success      204
// @Failure      422  {string}  string  "mail not configured or disabled"
// @Failure      500  {string}  string  "internal server error"
// @Failure      502  {string}  string  "SMTP delivery failed"
// @Router       /settings/mail/test [post]
func (h *Handler) Test(w http.ResponseWriter, r *http.Request) {
	var req testRequest
	// Body is optional — ignore decode errors (e.g. empty body).
	_ = json.NewDecoder(r.Body).Decode(&req)

	cfg, err := h.store.GetMailConfig(r.Context())
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "mail is not configured yet", http.StatusUnprocessableEntity)
			return
		}
		http.Error(w, "failed to load mail config", http.StatusInternalServerError)
		return
	}
	if !cfg.Enabled {
		http.Error(w, "mail is disabled", http.StatusUnprocessableEntity)
		return
	}
	if cfg.FromAddress == "" {
		http.Error(w, "from_address is not configured", http.StatusUnprocessableEntity)
		return
	}

	// Decrypt the stored password if auth is required.
	plainPassword := ""
	if cfg.AuthType != "none" && cfg.SMTPPassword != "" {
		if h.encryptionKey == nil {
			http.Error(w, "TLSENTINEL_ENCRYPTION_KEY is not set; cannot decrypt SMTP password", http.StatusUnprocessableEntity)
			return
		}
		plainPassword, err = crypto.Decrypt(h.encryptionKey, cfg.SMTPPassword)
		if err != nil {
			http.Error(w, "failed to decrypt SMTP password", http.StatusInternalServerError)
			return
		}
	}

	sendCfg := Config{
		SMTPHost:     cfg.SMTPHost,
		SMTPPort:     cfg.SMTPPort,
		AuthType:     cfg.AuthType,
		SMTPUsername: cfg.SMTPUsername,
		SMTPPassword: plainPassword,
		FromAddress:  cfg.FromAddress,
		FromName:     cfg.FromName,
		TLSMode:      cfg.TLSMode,
	}

	if err := SendTestEmail(sendCfg, req.To); err != nil {
		http.Error(w, "test email failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
