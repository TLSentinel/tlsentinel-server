package dashboard

import (
	"net/http"
	"strconv"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

// @Summary      List expiring certificates
// @Description  Returns active host-certificate pairs where the certificate expires within the given number of days. Includes already-expired certificates (negative days_remaining).
// @Tags         dashboard
// @Produce      json
// @Param        days  query  int  false  "Expiry window in days (default 30)"
// @Success      200  {object}  models.ExpiringCertList
// @Failure      500  {string}  string  "internal server error"
// @Router       /dashboard/expiring [get]
func (h *Handler) Expiring(w http.ResponseWriter, r *http.Request) {
	days := 30
	if d := r.URL.Query().Get("days"); d != "" {
		if n, err := strconv.Atoi(d); err == nil && n > 0 {
			days = n
		}
	}

	items, err := h.store.ListExpiringCerts(r.Context(), days)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, models.ExpiringCertList{Items: items})
}
