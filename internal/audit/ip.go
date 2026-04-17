package audit

import (
	"net"
	"net/http"
	"strings"
	"sync/atomic"
)

// trustedProxies holds the set of CIDRs whose traffic is allowed to set
// X-Forwarded-For. Nil/empty means XFF is always ignored.
//
// atomic.Pointer so SetTrustedProxies can run once at boot without
// contention against per-request reads.
var trustedProxies atomic.Pointer[[]*net.IPNet]

// SetTrustedProxies replaces the set of trusted proxy CIDRs. Pass nil or
// an empty slice to disable XFF trust entirely. Typically called once at
// startup from app.go.
func SetTrustedProxies(nets []*net.IPNet) {
	if len(nets) == 0 {
		trustedProxies.Store(nil)
		return
	}
	copy := append([]*net.IPNet(nil), nets...)
	trustedProxies.Store(&copy)
}

// IPFromRequest returns the client IP for audit purposes.
//
// If the TCP peer (r.RemoteAddr) is inside a trusted-proxy CIDR,
// X-Forwarded-For is parsed right-to-left and the first entry that is NOT
// in a trusted CIDR is returned — that is the real client talking to the
// outermost trusted hop. If every entry is trusted (unusual), or XFF is
// empty/malformed, we fall back to the peer IP.
//
// If the TCP peer is NOT in a trusted CIDR, XFF is ignored unconditionally
// — an untrusted caller cannot forge their source IP by supplying the
// header.
func IPFromRequest(r *http.Request) string {
	peer := peerIP(r)
	trusted := trustedProxies.Load()
	if trusted == nil || len(*trusted) == 0 || !inAny(peer, *trusted) {
		return peer
	}
	return clientFromXFF(r.Header.Get("X-Forwarded-For"), *trusted, peer)
}

func peerIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

func clientFromXFF(header string, trusted []*net.IPNet, fallback string) string {
	if header == "" {
		return fallback
	}
	parts := strings.Split(header, ",")
	for i := len(parts) - 1; i >= 0; i-- {
		candidate := strings.TrimSpace(parts[i])
		if candidate == "" {
			continue
		}
		if !inAny(candidate, trusted) {
			return candidate
		}
	}
	return fallback
}

func inAny(ipStr string, nets []*net.IPNet) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	for _, n := range nets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}
