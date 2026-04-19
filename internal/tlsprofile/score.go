package tlsprofile

import "strings"

// Grade is an SSL Labs-style letter grade.
type Grade string

const (
	GradeAPlus  Grade = "A+"
	GradeA      Grade = "A"
	GradeAMinus Grade = "A-"
	GradeB      Grade = "B"
	GradeC      Grade = "C"
	GradeD      Grade = "D"
	GradeE      Grade = "E"
	GradeF      Grade = "F"
	GradeT      Grade = "T" // Certificate not trusted.
	GradeM      Grade = "M" // Certificate name mismatch.
)

// ScoreInput contains the raw scan data needed to compute a score.
// All fields correspond to observable properties of a TLS connection.
type ScoreInput struct {
	// Protocol versions the server accepted.
	SSL20 bool
	SSL30 bool
	TLS10 bool
	TLS11 bool
	TLS12 bool
	TLS13 bool

	// CipherSuites accepted by the server, in IANA form.
	CipherSuites []string

	// KeyExchangeBits is the effective strength of the server's key
	// exchange (RSA key size, DH/ECDH parameter size, etc.).
	// A negative value means "unknown / not probed" and causes the
	// key-exchange sub-score and its associated caps to be skipped.
	KeyExchangeBits int

	// CertIssues tracks certificate-level problems that force grade
	// caps or automatic failures.
	CertNotTrusted      bool
	CertNameMismatch    bool
	CertExpired         bool
	CertSelfSigned      bool
	CertRevoked         bool
	CertInsecureSig     bool // MD2 or MD5 signature.
	CertChainIncomplete bool

	// Vulnerability flags.
	VulnHeartbleed bool
	VulnPoodle     bool // SSLv3 POODLE.
	VulnDrown      bool
	VulnRobot      bool

	// Forward secrecy: true if at least one suite uses ephemeral
	// key exchange (DHE or ECDHE).
	HasForwardSecrecy bool

	// HasAEAD: true if at least one suite uses authenticated encryption
	// (GCM, CCM, ChaCha20-Poly1305).
	HasAEAD bool

	// HSTS signals whether a valid Strict-Transport-Security header was
	// observed. nil means "unknown / not probed" and causes the HSTS
	// A- cap to be skipped.
	HSTS *bool
}

// ScoreResult is the computed score and letter grade.
type ScoreResult struct {
	// ProtocolScore is the protocol support sub-score (0-100).
	ProtocolScore int `json:"protocolScore"`

	// KeyExchangeScore is the key exchange sub-score (0-100), or nil if
	// the scanner did not probe key-exchange strength for this endpoint.
	// Nil is distinct from 0 (which means anonymous or broken key exchange).
	KeyExchangeScore *int `json:"keyExchangeScore"`

	// CipherScore is the cipher strength sub-score (0-100).
	CipherScore int `json:"cipherScore"`

	// Score is the weighted final score (0-100).
	Score int `json:"score"`

	// Grade is the letter grade after applying caps and overrides.
	Grade Grade `json:"grade"`

	// Warnings lists the reasons for any grade caps applied.
	Warnings []string `json:"warnings,omitempty"`
}

// Score computes an SSL Labs-style numerical score and letter grade
// based on the SSL Server Rating Guide methodology.
//
// Reference: https://github.com/ssllabs/research/wiki/SSL-Server-Rating-Guide
func Score(in ScoreInput) ScoreResult {
	var warnings []string

	// ─── Step 1: Protocol support score ──────────────────────────────────
	// "Start with the score of the best protocol. Add the score of the
	// worst protocol. Divide the total by 2."
	protocolScore := scoreProtocols(in)

	// ─── Step 2: Key exchange score ─────────────────────────────────────
	keyExScore, keyExKnown := scoreKeyExchange(in)

	// ─── Step 3: Cipher strength score ──────────────────────────────────
	// "Start with the score of the strongest cipher. Add the score of
	// the weakest cipher. Divide the total by 2."
	cipherScore := scoreCipherStrength(in)

	// ─── Step 4: Weighted combination ───────────────────────────────────
	// Protocol 30% + Key Exchange 30% + Cipher Strength 40%. When key
	// exchange is unknown, reweight across the remaining 70 so we don't
	// silently zero out ~30% of the score for endpoints we haven't probed.
	var finalScore int
	if keyExKnown {
		finalScore = (protocolScore*30 + keyExScore*30 + cipherScore*40) / 100
	} else {
		finalScore = (protocolScore*30 + cipherScore*40) / 70
	}

	// ─── Step 5: Derive letter grade from score ─────────────────────────
	grade := scoreToGrade(finalScore)

	// ─── Step 6: Apply automatic failures (force F) ─────────────────────
	if in.SSL20 {
		grade = GradeF
		warnings = append(warnings, "SSL 2.0 support forces F.")
	}
	if in.CertExpired {
		grade = GradeF
		warnings = append(warnings, "Expired certificate forces F.")
	}
	if in.CertSelfSigned {
		grade = GradeF
		warnings = append(warnings, "Self-signed certificate forces F.")
	}
	if in.CertRevoked {
		grade = GradeF
		warnings = append(warnings, "Revoked certificate forces F.")
	}
	if in.CertInsecureSig {
		grade = GradeF
		warnings = append(warnings, "Insecure certificate signature (MD2/MD5) forces F.")
	}
	if keyExKnown && in.KeyExchangeBits > 0 && in.KeyExchangeBits < 1024 {
		grade = GradeF
		warnings = append(warnings, "Insecure DH parameters (< 1024 bits) forces F.")
	}
	if hasExportSuites(in.CipherSuites) {
		grade = GradeF
		warnings = append(warnings, "Export cipher suites force F.")
	}
	if in.VulnHeartbleed {
		grade = GradeF
		warnings = append(warnings, "Heartbleed vulnerability forces F.")
	}
	if in.VulnDrown {
		grade = GradeF
		warnings = append(warnings, "DROWN vulnerability forces F.")
	}
	if in.VulnRobot {
		grade = GradeF
		warnings = append(warnings, "ROBOT vulnerability forces F.")
	}

	// ─── Step 7: Apply grade caps ───────────────────────────────────────
	// Only apply caps if we haven't already been forced to F.
	if grade != GradeF {
		// C caps
		if in.VulnPoodle {
			grade = capGrade(grade, GradeC)
			warnings = append(warnings, "POODLE vulnerability caps grade at C.")
		}
		if has3DES(in.CipherSuites) && (in.TLS11 || in.TLS12 || in.TLS13) {
			grade = capGrade(grade, GradeC)
			warnings = append(warnings, "3DES with TLS 1.1+ caps grade at C.")
		}
		if hasRC4(in.CipherSuites) && (in.TLS11 || in.TLS12 || in.TLS13) {
			grade = capGrade(grade, GradeC)
			warnings = append(warnings, "RC4 with TLS 1.1+ caps grade at C.")
		}

		// B caps
		if keyExKnown && in.KeyExchangeBits > 0 && in.KeyExchangeBits < 2048 {
			grade = capGrade(grade, GradeB)
			warnings = append(warnings, "Weak DH parameters (< 2048 bits) cap grade at B.")
		}
		if hasRC4(in.CipherSuites) {
			grade = capGrade(grade, GradeB)
			warnings = append(warnings, "RC4 support caps grade at B.")
		}
		if in.CertChainIncomplete {
			grade = capGrade(grade, GradeB)
			warnings = append(warnings, "Incomplete certificate chain caps grade at B.")
		}
		if !in.HasForwardSecrecy {
			grade = capGrade(grade, GradeB)
			warnings = append(warnings, "No forward secrecy caps grade at B.")
		}
		if !in.HasAEAD {
			grade = capGrade(grade, GradeB)
			warnings = append(warnings, "No AEAD cipher suites caps grade at B.")
		}
		if in.TLS10 || in.TLS11 {
			grade = capGrade(grade, GradeB)
			warnings = append(warnings, "TLS 1.0 or 1.1 support caps grade at B.")
		}

		// A- caps
		if !in.TLS13 {
			grade = capGrade(grade, GradeAMinus)
			warnings = append(warnings, "Missing TLS 1.3 support caps grade at A-.")
		}
		if in.HSTS != nil && !*in.HSTS {
			grade = capGrade(grade, GradeAMinus)
			warnings = append(warnings, "Missing HSTS caps grade at A-.")
		}
	}

	// ─── Step 8: Special certificate grades ─────────────────────────────
	if in.CertNotTrusted {
		grade = GradeT
		warnings = append(warnings, "Certificate not trusted.")
	}
	if in.CertNameMismatch {
		grade = GradeM
		warnings = append(warnings, "Certificate name mismatch.")
	}

	var keyExScorePtr *int
	if keyExKnown {
		s := keyExScore
		keyExScorePtr = &s
	}

	return ScoreResult{
		ProtocolScore:    protocolScore,
		KeyExchangeScore: keyExScorePtr,
		CipherScore:      cipherScore,
		Score:            finalScore,
		Grade:            grade,
		Warnings:         warnings,
	}
}

// ─── Protocol scoring ───────────────────────────────────────────────────────

var protocolScores = map[string]int{
	"SSL 2.0": 0,
	"SSL 3.0": 80,
	"TLS 1.0": 90,
	"TLS 1.1": 95,
	"TLS 1.2": 100,
	"TLS 1.3": 100,
}

func scoreProtocols(in ScoreInput) int {
	enabled := map[string]bool{
		"SSL 2.0": in.SSL20,
		"SSL 3.0": in.SSL30,
		"TLS 1.0": in.TLS10,
		"TLS 1.1": in.TLS11,
		"TLS 1.2": in.TLS12,
		"TLS 1.3": in.TLS13,
	}

	best, worst := -1, 101
	for name, on := range enabled {
		if !on {
			continue
		}
		s := protocolScores[name]
		if s > best {
			best = s
		}
		if s < worst {
			worst = s
		}
	}

	if best < 0 {
		return 0 // No protocols enabled.
	}

	return (best + worst) / 2
}

// ─── Key exchange scoring ───────────────────────────────────────────────────

// scoreKeyExchange returns the key-exchange sub-score (0-100) along
// with a known flag. known=false means the scanner did not probe key
// exchange strength and the caller should omit this component from the
// weighted combination rather than treat it as a zero-score anonymous
// key exchange.
func scoreKeyExchange(in ScoreInput) (score int, known bool) {
	bits := in.KeyExchangeBits

	// Unknown / not probed.
	if bits < 0 {
		return 0, false
	}

	// Anonymous or zero-strength key exchange.
	if bits == 0 {
		return 0, true
	}

	switch {
	case bits < 512:
		return 20, true
	case bits < 1024:
		return 40, true
	case bits < 2048:
		return 80, true
	case bits < 4096:
		return 90, true
	default:
		return 100, true
	}
}

// ─── Cipher strength scoring ────────────────────────────────────────────────

// cipherStrengthBits maps IANA suite names to their effective symmetric
// key strength in bits. This is used for the cipher strength sub-score.
var cipherStrengthBits = map[string]int{
	// NULL — 0 bits
	"TLS_RSA_WITH_NULL_MD5":    0,
	"TLS_RSA_WITH_NULL_SHA":    0,
	"TLS_RSA_WITH_NULL_SHA256": 0,
}

func scoreCipherStrength(in ScoreInput) int {
	if len(in.CipherSuites) == 0 {
		return 0
	}

	best, worst := -1, 101
	for _, name := range in.CipherSuites {
		s := cipherBitsToScore(cipherEffectiveBits(name))
		if s > best {
			best = s
		}
		if s < worst {
			worst = s
		}
	}

	if best < 0 {
		return 0
	}

	return (best + worst) / 2
}

// cipherEffectiveBits returns the effective symmetric key strength for
// a cipher suite name. Derives the value from the suite name when not
// in the explicit override map.
func cipherEffectiveBits(name string) int {
	if bits, ok := cipherStrengthBits[name]; ok {
		return bits
	}

	// Derive from the suite name.
	upper := strings.ToUpper(name)

	// NULL — no encryption.
	if strings.Contains(upper, "NULL") {
		return 0
	}

	// Export ciphers — 40-bit or 56-bit.
	if strings.Contains(upper, "EXPORT") {
		if strings.Contains(upper, "1024") {
			return 56
		}
		return 40
	}

	// DES (not 3DES) — 56 bits.
	if strings.Contains(upper, "DES_CBC") && !strings.Contains(upper, "3DES") {
		return 56
	}

	// RC4 — 128-bit key but effectively weaker; treated as 128 for scoring.
	if strings.Contains(upper, "RC4") {
		return 128
	}

	// RC2 — 40-bit effective in export contexts, otherwise 128.
	if strings.Contains(upper, "RC2") {
		return 128
	}

	// 3DES — 112 effective bits (168-bit key, 112-bit security).
	if strings.Contains(upper, "3DES") {
		return 112
	}

	// IDEA — 128 bits.
	if strings.Contains(upper, "IDEA") {
		return 128
	}

	// SEED — 128 bits.
	if strings.Contains(upper, "SEED") {
		return 128
	}

	// ChaCha20 — 256 bits.
	if strings.Contains(upper, "CHACHA20") {
		return 256
	}

	// AES — derive key size from name.
	if strings.Contains(upper, "AES_256") || strings.Contains(upper, "AES256") {
		return 256
	}
	if strings.Contains(upper, "AES_128") || strings.Contains(upper, "AES128") {
		return 128
	}

	// Camellia — derive key size from name.
	if strings.Contains(upper, "CAMELLIA_256") || strings.Contains(upper, "CAMELLIA256") {
		return 256
	}
	if strings.Contains(upper, "CAMELLIA_128") || strings.Contains(upper, "CAMELLIA128") {
		return 128
	}

	// GOST — 256-bit key.
	if strings.Contains(upper, "GOST") || strings.Contains(upper, "28147") {
		return 256
	}

	// Unknown — assume 128 so we don't over-penalise unrecognised suites.
	return 128
}

// cipherBitsToScore converts effective key bits to the SSL Labs cipher
// strength score.
func cipherBitsToScore(bits int) int {
	switch {
	case bits == 0:
		return 0
	case bits < 128:
		return 20
	case bits < 256:
		return 80
	default:
		return 100
	}
}

// ─── Grade helpers ──────────────────────────────────────────────────────────

func scoreToGrade(score int) Grade {
	switch {
	case score >= 80:
		return GradeA
	case score >= 65:
		return GradeB
	case score >= 50:
		return GradeC
	case score >= 35:
		return GradeD
	case score >= 20:
		return GradeE
	default:
		return GradeF
	}
}

// gradeRank maps grades to a numeric rank for comparison.
// Lower rank = worse grade.
var gradeRank = map[Grade]int{
	GradeF:      0,
	GradeE:      1,
	GradeD:      2,
	GradeC:      3,
	GradeB:      4,
	GradeAMinus: 5,
	GradeA:      6,
	GradeAPlus:  7,
	GradeT:      -1,
	GradeM:      -1,
}

// capGrade returns the lower of the current grade and the cap.
func capGrade(current, cap Grade) Grade {
	if gradeRank[current] > gradeRank[cap] {
		return cap
	}
	return current
}

// ─── Suite detection helpers ────────────────────────────────────────────────

func hasExportSuites(suites []string) bool {
	for _, s := range suites {
		if strings.Contains(strings.ToUpper(s), "EXPORT") {
			return true
		}
	}
	return false
}

func hasRC4(suites []string) bool {
	for _, s := range suites {
		if strings.Contains(strings.ToUpper(s), "RC4") {
			return true
		}
	}
	return false
}

func has3DES(suites []string) bool {
	for _, s := range suites {
		if strings.Contains(strings.ToUpper(s), "3DES") {
			return true
		}
	}
	return false
}

// HasForwardSecrecy reports whether any of the suites provides forward
// secrecy via ephemeral key exchange (ECDHE/DHE) or via TLS 1.3 (where
// FS is built into the handshake and the suite name omits the key
// exchange, e.g. TLS_AES_128_GCM_SHA256).
func HasForwardSecrecy(suites []string) bool {
	for _, s := range suites {
		upper := strings.ToUpper(s)
		if strings.Contains(upper, "ECDHE_") ||
			strings.Contains(upper, "DHE_") ||
			isTLS13SuiteName(upper) {
			return true
		}
	}
	return false
}

// HasAEAD reports whether any of the suites uses authenticated encryption
// (AES-GCM, AES-CCM, or ChaCha20-Poly1305). All TLS 1.3 suites are AEAD
// by construction.
func HasAEAD(suites []string) bool {
	for _, s := range suites {
		upper := strings.ToUpper(s)
		if strings.Contains(upper, "_GCM_") ||
			strings.Contains(upper, "_CCM") ||
			strings.Contains(upper, "POLY1305") ||
			isTLS13SuiteName(upper) {
			return true
		}
	}
	return false
}

// isTLS13SuiteName identifies TLS 1.3 suite names, which omit the
// _WITH_ separator present in all TLS ≤1.2 suite names.
func isTLS13SuiteName(upper string) bool {
	return strings.HasPrefix(upper, "TLS_") && !strings.Contains(upper, "_WITH_")
}
