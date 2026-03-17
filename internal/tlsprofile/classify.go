// Package tlsprofile classifies raw TLS scan data into human-readable findings.
// Classification rules (versions, cipher suites) live exclusively here —
// no other file needs to change when adding or reclassifying a suite.
package tlsprofile

// Severity indicates the security posture of a TLS version or cipher suite.
type Severity string

const (
	SeverityOK       Severity = "ok"       // Modern, no known issues.
	SeverityWarning  Severity = "warning"  // Weak but not actively broken.
	SeverityCritical Severity = "critical" // Broken or prohibited.
)

// Finding is the classification of a single TLS version or cipher suite.
type Finding struct {
	Name     string   `json:"name"`
	Reason   string   `json:"reason"`
	Severity Severity `json:"severity"`
}

// Result is the fully-classified output for a TLS profile scan.
// Every version checked and every cipher suite accepted by the server
// appears here — not just the bad ones.
type Result struct {
	// Versions contains one Finding per TLS version that was probed,
	// ordered from oldest to newest.
	Versions []Finding `json:"versions"`

	// CipherSuites contains one Finding per TLS 1.2 cipher suite the
	// server accepted, in the order they were probed.
	CipherSuites []Finding `json:"cipherSuites"`

	// OverallSeverity is the worst severity across all findings.
	// Use this to colour-code the host at a glance.
	OverallSeverity Severity `json:"overallSeverity"`
}

// versionClassifications covers every TLS version the scanner probes.
// Add new versions here as needed.
var versionClassifications = map[string]Finding{
	"TLS 1.0": {
		Name:     "TLS 1.0",
		Reason:   "Deprecated by RFC 8996 (March 2021). Vulnerable to POODLE and BEAST attacks.",
		Severity: SeverityCritical,
	},
	"TLS 1.1": {
		Name:     "TLS 1.1",
		Reason:   "Deprecated by RFC 8996 (March 2021). Lacks support for AEAD cipher suites.",
		Severity: SeverityWarning,
	},
	"TLS 1.2": {
		Name:     "TLS 1.2",
		Reason:   "Widely supported. Secure when restricted to AEAD cipher suites.",
		Severity: SeverityOK,
	},
	"TLS 1.3": {
		Name:     "TLS 1.3",
		Reason:   "Current best practice. AEAD-only; obsolete features removed from the protocol.",
		Severity: SeverityOK,
	},
}

// versionOrder defines the display order for version findings.
var versionOrder = []string{"TLS 1.0", "TLS 1.1", "TLS 1.2", "TLS 1.3"}

// cipherClassifications covers all TLS 1.2 cipher suites reported by
// crypto/tls, grouped by root cause. Suites are grouped by root cause so
// the reasoning is easy to follow and new entries slot into the right section.
//
// To add a newly-deprecated suite: add one entry here. No other file changes.
var cipherClassifications = map[string]Finding{

	// ── RC4 ──────────────────────────────────────────────────────────────────
	// Stream cipher with known statistical biases. Prohibited by RFC 7465.
	"TLS_RSA_WITH_RC4_128_SHA": {
		Name:     "TLS_RSA_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_ECDSA_WITH_RC4_128_SHA": {
		Name:     "TLS_ECDHE_ECDSA_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_RSA_WITH_RC4_128_SHA": {
		Name:     "TLS_ECDHE_RSA_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},

	// ── 3DES ─────────────────────────────────────────────────────────────────
	// 64-bit block size makes it vulnerable to the SWEET32 birthday attack
	// (~785 GB of traffic in a single session). Deprecated by RFC 7525.
	"TLS_RSA_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to the SWEET32 birthday attack. No forward secrecy.",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to the SWEET32 birthday attack.",
		Severity: SeverityCritical,
	},

	// ── Static RSA key exchange (no forward secrecy) ─────────────────────────
	// The server's private key directly decrypts the session key. A future key
	// compromise retroactively decrypts all past sessions.
	"TLS_RSA_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_RSA_WITH_AES_128_CBC_SHA",
		Reason:   "Static RSA key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_RSA_WITH_AES_256_CBC_SHA",
		Reason:   "Static RSA key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_RSA_WITH_AES_128_CBC_SHA256",
		Reason:   "Static RSA key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_RSA_WITH_AES_128_GCM_SHA256",
		Reason:   "Static RSA key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_RSA_WITH_AES_256_GCM_SHA384",
		Reason:   "Static RSA key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},

	// ── ECDHE + CBC (no AEAD) ─────────────────────────────────────────────────
	// Forward secrecy is present, but CBC mode lacks authenticated encryption.
	// Prefer ECDHE+AES-GCM or ECDHE+ChaCha20-Poly1305.
	"TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},

	// ── ECDHE + AEAD (recommended) ────────────────────────────────────────────
	// Forward secrecy via ephemeral ECDH key exchange and authenticated
	// encryption via GCM or ChaCha20-Poly1305. These are the target suites
	// for modern Windows/IIS and Linux/nginx configurations.
	"TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
		Reason:   "Forward secrecy with AES-128-GCM (AEAD). Recommended.",
		Severity: SeverityOK,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
		Reason:   "Forward secrecy with AES-128-GCM (AEAD). Recommended.",
		Severity: SeverityOK,
	},
	"TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
		Reason:   "Forward secrecy with AES-256-GCM (AEAD). Recommended.",
		Severity: SeverityOK,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
		Reason:   "Forward secrecy with AES-256-GCM (AEAD). Recommended.",
		Severity: SeverityOK,
	},
	"TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256": {
		Name:     "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
		Reason:   "Forward secrecy with ChaCha20-Poly1305 (AEAD). Recommended; preferred on hardware without AES acceleration.",
		Severity: SeverityOK,
	},
	"TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256": {
		Name:     "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
		Reason:   "Forward secrecy with ChaCha20-Poly1305 (AEAD). Recommended; preferred on hardware without AES acceleration.",
		Severity: SeverityOK,
	},
}

// Classify evaluates raw TLS scan data and returns a fully-classified Result.
// Every version that was probed and every cipher suite the server accepted
// appears in the output — not just the problematic ones.
//
// tls10..tls13 indicate which protocol versions the server accepted.
// cipherSuites is the list of TLS 1.2 suite names the server accepted, using
// the names returned by crypto/tls (e.g. "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256").
func Classify(tls10, tls11, tls12, tls13 bool, cipherSuites []string) Result {
	overall := SeverityOK

	// Build version findings in a consistent oldest-to-newest order.
	versionEnabled := map[string]bool{
		"TLS 1.0": tls10,
		"TLS 1.1": tls11,
		"TLS 1.2": tls12,
		"TLS 1.3": tls13,
	}
	versions := make([]Finding, 0, 4)
	for _, name := range versionOrder {
		if versionEnabled[name] {
			f := versionClassifications[name]
			versions = append(versions, f)
			overall = worst(overall, f.Severity)
		}
	}

	// Build cipher suite findings, preserving probe order.
	suites := make([]Finding, 0, len(cipherSuites))
	for _, name := range cipherSuites {
		if f, ok := cipherClassifications[name]; ok {
			suites = append(suites, f)
		} else {
			// Unrecognised suite — not in our map, so not a known-weak cipher.
			// Surface it anyway so nothing is silently hidden.
			suites = append(suites, Finding{
				Name:     name,
				Reason:   "Not a known-weak cipher suite; verify against your organisation's policy.",
				Severity: SeverityOK,
			})
		}
		overall = worst(overall, suites[len(suites)-1].Severity)
	}

	return Result{
		Versions:        versions,
		CipherSuites:    suites,
		OverallSeverity: overall,
	}
}

// worst returns the more severe of two Severity values.
func worst(a, b Severity) Severity {
	if a == SeverityCritical || b == SeverityCritical {
		return SeverityCritical
	}
	if a == SeverityWarning || b == SeverityWarning {
		return SeverityWarning
	}
	return SeverityOK
}
