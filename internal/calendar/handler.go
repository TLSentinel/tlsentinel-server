package calendar

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	ical "github.com/arran4/golang-ical"
	"github.com/go-chi/chi/v5"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
)

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

// GET /calendar/u/{token}/*
func (h *Handler) ServeUserCalendar(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	u, err := h.store.GetUserByCalendarToken(r.Context(), token)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	certs, err := h.store.ListExpiringActiveCertsTagged(r.Context(), u.ID, 365)
	if err != nil {
		http.Error(w, "failed to load certificates", http.StatusInternalServerError)
		return
	}

	cal := ical.NewCalendar()
	cal.SetMethod(ical.MethodPublish)
	cal.SetProductId("-//TLSentinel//Certificate Feed//EN")
	cal.SetXWRCalName("TLSentinel — Certificate Expiry")
	cal.SetXWRCalDesc("Certificate expiry events from TLSentinel")
	cal.SetXWRTimezone("UTC")
	cal.SetRefreshInterval("PT1H")

	for _, cert := range certs {
		event := cal.AddEvent(fmt.Sprintf("%s@tlsentinel", cert.Fingerprint))
		event.SetSummary(fmt.Sprintf("Certificate expiry: %s (%s)", cert.CommonName, cert.EndpointName))
		event.SetDescription(fmt.Sprintf(
			"Endpoint: %s\nType: %s\nCommon Name: %s\nExpires: %s\nDays Remaining: %d\nFingerprint: %s",
			cert.EndpointName,
			cert.EndpointType,
			cert.CommonName,
			cert.NotAfter.UTC().Format(time.RFC1123),
			cert.DaysRemaining,
			cert.Fingerprint,
		))

		// All-day event on the expiry date.
		expiry := cert.NotAfter.UTC()
		event.SetAllDayStartAt(expiry)
		event.SetAllDayEndAt(expiry)

		// Reminders at each standard threshold.
		for _, days := range []int{30, 14, 7, 1} {
			alarm := event.AddAlarm()
			alarm.SetAction(ical.ActionDisplay)
			alarm.SetTrigger(fmt.Sprintf("-P%dD", days))
			alarm.SetDescription(fmt.Sprintf("Certificate expiring in %d days: %s", days, cert.CommonName))
		}
	}

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", "inline; filename=\"tlsentinel.ics\"")
	_ = cal.SerializeTo(w)
}
