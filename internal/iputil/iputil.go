// Package iputil holds small input-shape helpers used by the universal
// search path. The goal is to decide which query semantics to apply to a
// user's input — text-style ILIKE substring vs. IP-style exact/prefix —
// not to validate addresses.
package iputil

// LooksLikeIP reports whether the input is shaped like an IPv4 or IPv6
// fragment that should be matched against IP-bearing columns with
// prefix/exact semantics rather than text-style ILIKE substring.
//
// The detector is intentionally permissive — it is making a routing
// decision, not validating the address:
//
//   - IPv4 shape: digits and dots only, with at least one dot. A bare
//     "10" returns false (too ambiguous with general text); "10.0"
//     returns true.
//   - IPv6 shape: hex digits and colons, with at least one colon.
//     "fe80::1" returns true; "abc" returns false.
//   - Anything containing characters outside `[0-9a-fA-F.:]` returns
//     false (e.g. "10.0.5.7-pool" — the trailing "-pool" disqualifies
//     it, fall back to text search).
//
// CIDR (`10.0.0.0/24`) intentionally returns false; a slash is not in
// the allowed set. Adding CIDR support is a separate, larger change
// (requires the inet column type) and is deferred.
func LooksLikeIP(s string) bool {
	if len(s) < 2 {
		return false
	}
	var hasDot, hasColon, hasHex bool
	for _, r := range s {
		switch {
		case r == '.':
			hasDot = true
		case r == ':':
			hasColon = true
		case r >= '0' && r <= '9':
			// digit — neutral, both v4 and v6.
		case (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F'):
			hasHex = true
		default:
			return false
		}
	}
	// IPv6 always wins when a colon is present — colons unambiguously
	// signal v6 shape (no other identifier we'd reasonably search uses
	// `:` mixed with hex/digits).
	if hasColon {
		return true
	}
	// IPv4 requires a dot AND must not contain hex chars (digits + dots
	// only). "abc.def" has dots and hex chars but no colon → returns
	// false, fall back to text search.
	return hasDot && !hasHex
}
