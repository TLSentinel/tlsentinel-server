package notificationtemplates

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/notifications"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

func errResponse(w http.ResponseWriter, status int, msg string) {
	http.Error(w, msg, status)
}

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

// templateResponse is the API shape returned for every template — always
// includes the effective subject/body (DB override or embedded default)
// plus metadata the frontend needs.
type templateResponse struct {
	EventType string                           `json:"eventType"`
	Channel   string                           `json:"channel"`
	Label     string                           `json:"label"`
	Subject   *string                          `json:"subject"`
	Body      string                           `json:"body"`
	Format    string                           `json:"format"`
	IsCustom  bool                             `json:"isCustom"`
	Variables []notifications.TemplateVariable `json:"variables"`
}

// List returns all templates (all known event_type × channel combos),
// merged with any DB overrides.
//
// @Summary  List notification templates
// @Tags     notification-templates
// @Produce  json
// @Success  200  {array}   templateResponse
// @Router   /notification-templates [get]
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Load all DB overrides into a lookup map.
	dbRows, err := h.store.ListNotificationTemplates(ctx)
	if err != nil {
		errResponse(w, http.StatusInternalServerError, "failed to load templates")
		return
	}
	overrides := make(map[string]*db.NotificationTemplate, len(dbRows))
	for i := range dbRows {
		key := dbRows[i].EventType + "|" + dbRows[i].Channel
		overrides[key] = &dbRows[i]
	}

	var out []templateResponse
	for _, et := range notifications.AllEventTypes {
		for _, ch := range notifications.AllChannels {
			def, ok := notifications.GetDefault(et, ch)
			if !ok {
				continue
			}
			tr := templateResponse{
				EventType: et,
				Channel:   ch,
				Label:     notifications.EventTypeLabels[et],
				Subject:   &def.Subject,
				Body:      def.Body,
				Format:    def.Format,
				IsCustom:  false,
				Variables: notifications.TemplateVariables[et],
			}
			if def.Subject == "" {
				tr.Subject = nil
			}
			if ov, found := overrides[et+"|"+ch]; found {
				tr.Subject = ov.Subject
				tr.Body = ov.Body
				tr.Format = ov.Format
				tr.IsCustom = true
			}
			out = append(out, tr)
		}
	}

	response.JSON(w, http.StatusOK, out)
}

// Get returns a single template by event_type and channel.
//
// @Summary  Get a notification template
// @Tags     notification-templates
// @Produce  json
// @Param    eventType  path      string  true  "Event type"
// @Param    channel    path      string  true  "Channel"
// @Success  200        {object}  templateResponse
// @Router   /notification-templates/{eventType}/{channel} [get]
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	eventType := chi.URLParam(r, "eventType")
	channel := chi.URLParam(r, "channel")

	def, ok := notifications.GetDefault(eventType, channel)
	if !ok {
		errResponse(w, http.StatusNotFound, "unknown event type or channel")
		return
	}

	tr := templateResponse{
		EventType: eventType,
		Channel:   channel,
		Label:     notifications.EventTypeLabels[eventType],
		Subject:   &def.Subject,
		Body:      def.Body,
		Format:    def.Format,
		IsCustom:  false,
		Variables: notifications.TemplateVariables[eventType],
	}
	if def.Subject == "" {
		tr.Subject = nil
	}

	ov, err := h.store.GetNotificationTemplate(r.Context(), eventType, channel)
	if err != nil && !errors.Is(err, db.ErrNotFound) {
		errResponse(w, http.StatusInternalServerError, "failed to load template")
		return
	}
	if ov != nil {
		tr.Subject = ov.Subject
		tr.Body = ov.Body
		tr.Format = ov.Format
		tr.IsCustom = true
	}

	response.JSON(w, http.StatusOK, tr)
}

// Update saves a customised template override.
//
// @Summary  Update a notification template
// @Tags     notification-templates
// @Accept   json
// @Produce  json
// @Param    eventType  path      string  true  "Event type"
// @Param    channel    path      string  true  "Channel"
// @Success  200        {object}  templateResponse
// @Router   /notification-templates/{eventType}/{channel} [put]
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	eventType := chi.URLParam(r, "eventType")
	channel := chi.URLParam(r, "channel")

	if _, ok := notifications.GetDefault(eventType, channel); !ok {
		errResponse(w, http.StatusNotFound, "unknown event type or channel")
		return
	}

	var req struct {
		Subject *string `json:"subject"`
		Body    string  `json:"body"`
		Format  string  `json:"format"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errResponse(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Body == "" {
		errResponse(w, http.StatusBadRequest, "body is required")
		return
	}
	if req.Format == "" {
		req.Format = "html"
	}

	saved, err := h.store.UpsertNotificationTemplate(r.Context(), eventType, channel, req.Subject, req.Body, req.Format)
	if err != nil {
		errResponse(w, http.StatusInternalServerError, "failed to save template")
		return
	}

	tr := templateResponse{
		EventType: saved.EventType,
		Channel:   saved.Channel,
		Label:     notifications.EventTypeLabels[saved.EventType],
		Subject:   saved.Subject,
		Body:      saved.Body,
		Format:    saved.Format,
		IsCustom:  true,
		Variables: notifications.TemplateVariables[saved.EventType],
	}
	response.JSON(w, http.StatusOK, tr)
}

// Reset deletes a DB override, restoring the embedded default.
//
// @Summary  Reset a notification template to default
// @Tags     notification-templates
// @Param    eventType  path  string  true  "Event type"
// @Param    channel    path  string  true  "Channel"
// @Success  204
// @Router   /notification-templates/{eventType}/{channel} [delete]
func (h *Handler) Reset(w http.ResponseWriter, r *http.Request) {
	eventType := chi.URLParam(r, "eventType")
	channel := chi.URLParam(r, "channel")

	if err := h.store.ResetNotificationTemplate(r.Context(), eventType, channel); err != nil {
		errResponse(w, http.StatusInternalServerError, "failed to reset template")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
