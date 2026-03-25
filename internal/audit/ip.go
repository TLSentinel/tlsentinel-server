package audit

import (
	"net"
	"net/http"
	"strings"
)

// IPFromRequest returns the client IP, honoring X-Forwarded-For if present.
func IPFromRequest(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return strings.TrimSpace(strings.SplitN(fwd, ",", 2)[0])
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}
