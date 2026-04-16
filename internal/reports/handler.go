package reports

import (
	"log/slog"
	"net/http"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

// @Summary      TLS posture report
// @Description  Returns aggregated TLS protocol, cipher, and CA distribution across all scanned endpoints.
// @Tags         reports
// @Produce      json
// @Success      200  {object}  models.TLSPostureReport
// @Failure      500  {string}  string  "internal server error"
// @Router       /reports/tls-posture [get]
func (h *Handler) TLSPosture(w http.ResponseWriter, r *http.Request) {
	report, err := h.store.GetTLSPostureReport(r.Context())
	if err != nil {
		slog.Error("tls posture report", "err", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, report)
}
