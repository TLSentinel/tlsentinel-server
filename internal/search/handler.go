// Package search serves the header command-search endpoint. Thin wrapper over
// db.UniversalSearch — a dedicated package keeps routes.go symmetric with the
// other per-resource handlers.
package search

import (
	"net/http"
	"strings"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

// Per-type result cap. Keeps the dropdown compact; tune as needed.
const perTypeLimit = 5

// Minimum query length. Shorter strings produce too many hits to be useful.
const minQueryLen = 2

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

// @Summary      Universal search
// @Description  Returns up to 5 matches each of endpoints, certificates, and scanners whose name/DNS/URL/common-name/fingerprint contains the query. Queries shorter than 2 characters return empty lists.
// @Tags         search
// @Produce      json
// @Param        q  query  string  true  "Search query (min 2 chars)"
// @Success      200  {object}  models.SearchResults
// @Failure      500  {string}  string  "internal server error"
// @Router       /search [get]
func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(q)) < minQueryLen {
		response.JSON(w, http.StatusOK, models.SearchResults{
			Endpoints:    []models.SearchEndpoint{},
			Certificates: []models.SearchCertificate{},
			Scanners:     []models.SearchScanner{},
		})
		return
	}
	results, err := h.store.UniversalSearch(r.Context(), q, perTypeLimit)
	if err != nil {
		http.Error(w, "search failed", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, results)
}
