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
	"SSL 3.0": {
		Name:     "SSL 3.0",
		Reason:   "Deprecated by RFC 7568 (June 2015). Vulnerable to POODLE with any CBC cipher.",
		Severity: SeverityCritical,
	},
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
var versionOrder = []string{"SSL 3.0", "TLS 1.0", "TLS 1.1", "TLS 1.2", "TLS 1.3"}

// Classify evaluates raw TLS scan data and returns a fully-classified Result.
// Every version that was probed and every cipher suite the server accepted
// appears in the output — not just the problematic ones.
//
// ssl30, tls10..tls13 indicate which protocol versions the server accepted.
// cipherSuites is the list of TLS 1.2 suite names the server accepted, using
// the names returned by crypto/tls (e.g. "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256").
func Classify(ssl30, tls10, tls11, tls12, tls13 bool, cipherSuites []string) Result {
	overall := SeverityOK

	// Build version findings in a consistent oldest-to-newest order.
	versionEnabled := map[string]bool{
		"SSL 3.0": ssl30,
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
