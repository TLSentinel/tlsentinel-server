package logger

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
)

// RequestLogger is a chi-compatible middleware that logs each completed HTTP
// request with method, path, status, latency, and the chi request ID.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

		next.ServeHTTP(ww, r)

		zap.L().Info("request",
			zap.String("method", r.Method),
			zap.String("path", r.URL.Path),
			zap.Int("status", ww.Status()),
			zap.Duration("latency", time.Since(start)),
			zap.String("request_id", middleware.GetReqID(r.Context())),
			zap.String("remote_addr", r.RemoteAddr),
		)
	})
}
