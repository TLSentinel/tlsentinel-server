package handlers

import "net/http"

// MaxRequestBody caps the bytes any handler will read from r.Body.
// Exceeding the limit causes the next Read to return an error, which
// handlers surface as a 400. 10 MiB is well above any legitimate
// JSON payload we accept (scan results with full chain are &lt;1 MiB).
const MaxRequestBody = 10 * 1024 * 1024

// MaxBodySize wraps r.Body in http.MaxBytesReader to protect against
// resource exhaustion from oversized or unbounded uploads.
func MaxBodySize(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, MaxRequestBody)
		}
		next.ServeHTTP(w, r)
	})
}
