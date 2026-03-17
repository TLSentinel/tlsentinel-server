package handlers

import (
	"net/http"

	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

func NotImplemented(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusNotImplemented, map[string]string{
		"status":  "error",
		"message": "not implemented",
	})
}
