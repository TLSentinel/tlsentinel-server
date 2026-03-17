package handlers

import (
	"net/http"

	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

func Health(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusOK, map[string]string{
		"status": "ok",
	})
}
