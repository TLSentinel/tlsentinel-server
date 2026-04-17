package response

import (
	"encoding/json"
	"net/http"

	"go.uber.org/zap"
)

// JSON writes payload as JSON with the given status code.
//
// Encoding errors are logged but cannot be surfaced to the client — headers
// and status have already been flushed. A log entry is the only signal an
// operator gets that a handler produced a broken response.
func JSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		zap.L().Error("json encode failed", zap.Error(err))
	}
}
