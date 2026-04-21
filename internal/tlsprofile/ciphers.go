package tlsprofile

// cipherClassifications covers all known TLS cipher suites, grouped by root
// cause. This is scanner-agnostic — any tool that normalises to IANA names
// (via NormalizeCipherName) will get a classification.
//
// To add a newly-deprecated suite: add one entry here. No other file changes.
var cipherClassifications = map[string]Finding{

	// ═════════════════════════════════════════════════════════════════════════
	// CRITICAL — broken, prohibited, or providing no real security
	// ═════════════════════════════════════════════════════════════════════════

	// ── NULL (no encryption) ─────────────────────────────────────────────────
	// Traffic is sent in plaintext. Only authentication (if any) is provided.
	"TLS_RSA_WITH_NULL_MD5": {
		Name:     "TLS_RSA_WITH_NULL_MD5",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_WITH_NULL_SHA": {
		Name:     "TLS_RSA_WITH_NULL_SHA",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_WITH_NULL_SHA256": {
		Name:     "TLS_RSA_WITH_NULL_SHA256",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_RSA_WITH_NULL_SHA": {
		Name:     "TLS_ECDHE_RSA_WITH_NULL_SHA",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_ECDSA_WITH_NULL_SHA": {
		Name:     "TLS_ECDHE_ECDSA_WITH_NULL_SHA",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_ECDH_RSA_WITH_NULL_SHA": {
		Name:     "TLS_ECDH_RSA_WITH_NULL_SHA",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_ECDH_ECDSA_WITH_NULL_SHA": {
		Name:     "TLS_ECDH_ECDSA_WITH_NULL_SHA",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_ECDH_anon_WITH_NULL_SHA": {
		Name:     "TLS_ECDH_anon_WITH_NULL_SHA",
		Reason:   "NULL cipher with anonymous key exchange — no encryption and no authentication.",
		Severity: SeverityCritical,
	},
	"TLS_PSK_WITH_NULL_SHA": {
		Name:     "TLS_PSK_WITH_NULL_SHA",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_PSK_WITH_NULL_SHA256": {
		Name:     "TLS_PSK_WITH_NULL_SHA256",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_PSK_WITH_NULL_SHA384": {
		Name:     "TLS_PSK_WITH_NULL_SHA384",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_PSK_WITH_NULL_SHA": {
		Name:     "TLS_DHE_PSK_WITH_NULL_SHA",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_PSK_WITH_NULL_SHA256": {
		Name:     "TLS_DHE_PSK_WITH_NULL_SHA256",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_PSK_WITH_NULL_SHA384": {
		Name:     "TLS_DHE_PSK_WITH_NULL_SHA384",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_PSK_WITH_NULL_SHA": {
		Name:     "TLS_RSA_PSK_WITH_NULL_SHA",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_PSK_WITH_NULL_SHA256": {
		Name:     "TLS_RSA_PSK_WITH_NULL_SHA256",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_PSK_WITH_NULL_SHA384": {
		Name:     "TLS_RSA_PSK_WITH_NULL_SHA384",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_PSK_WITH_NULL_SHA": {
		Name:     "TLS_ECDHE_PSK_WITH_NULL_SHA",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_PSK_WITH_NULL_SHA256": {
		Name:     "TLS_ECDHE_PSK_WITH_NULL_SHA256",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_PSK_WITH_NULL_SHA384": {
		Name:     "TLS_ECDHE_PSK_WITH_NULL_SHA384",
		Reason:   "NULL cipher — no encryption; traffic is plaintext.",
		Severity: SeverityCritical,
	},

	// ── EXPORT (intentionally weakened) ──────────────────────────────────────
	// Mandated ≤56-bit key lengths for US export compliance. Trivially broken.
	"TLS_RSA_EXPORT_WITH_RC4_40_MD5": {
		Name:     "TLS_RSA_EXPORT_WITH_RC4_40_MD5",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_EXPORT_WITH_RC2_CBC_40_MD5": {
		Name:     "TLS_RSA_EXPORT_WITH_RC2_CBC_40_MD5",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_EXPORT_WITH_DES40_CBC_SHA": {
		Name:     "TLS_RSA_EXPORT_WITH_DES40_CBC_SHA",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_DH_RSA_EXPORT_WITH_DES40_CBC_SHA": {
		Name:     "TLS_DH_RSA_EXPORT_WITH_DES40_CBC_SHA",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_DH_DSS_EXPORT_WITH_DES40_CBC_SHA": {
		Name:     "TLS_DH_DSS_EXPORT_WITH_DES40_CBC_SHA",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_RSA_EXPORT_WITH_DES40_CBC_SHA": {
		Name:     "TLS_DHE_RSA_EXPORT_WITH_DES40_CBC_SHA",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_DSS_EXPORT_WITH_DES40_CBC_SHA": {
		Name:     "TLS_DHE_DSS_EXPORT_WITH_DES40_CBC_SHA",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_EXPORT_WITH_DES40_CBC_SHA": {
		Name:     "TLS_DH_anon_EXPORT_WITH_DES40_CBC_SHA",
		Reason:   "EXPORT-grade cipher with 40-bit key and anonymous key exchange; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_EXPORT1024_WITH_RC4_56_MD5": {
		Name:     "TLS_RSA_EXPORT1024_WITH_RC4_56_MD5",
		Reason:   "EXPORT-grade cipher with 56-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_EXPORT1024_WITH_RC2_CBC_56_MD5": {
		Name:     "TLS_RSA_EXPORT1024_WITH_RC2_CBC_56_MD5",
		Reason:   "EXPORT-grade cipher with 56-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_EXPORT1024_WITH_DES_CBC_SHA": {
		Name:     "TLS_RSA_EXPORT1024_WITH_DES_CBC_SHA",
		Reason:   "EXPORT-grade cipher with 56-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_DSS_EXPORT1024_WITH_DES_CBC_SHA": {
		Name:     "TLS_DHE_DSS_EXPORT1024_WITH_DES_CBC_SHA",
		Reason:   "EXPORT-grade cipher with 56-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_EXPORT1024_WITH_RC4_56_SHA": {
		Name:     "TLS_RSA_EXPORT1024_WITH_RC4_56_SHA",
		Reason:   "EXPORT-grade cipher with 56-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_DSS_EXPORT1024_WITH_RC4_56_SHA": {
		Name:     "TLS_DHE_DSS_EXPORT1024_WITH_RC4_56_SHA",
		Reason:   "EXPORT-grade cipher with 56-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_EXPORT_WITH_DES_CBC_40_SHA": {
		Name:     "TLS_KRB5_EXPORT_WITH_DES_CBC_40_SHA",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_EXPORT_WITH_RC2_CBC_40_SHA": {
		Name:     "TLS_KRB5_EXPORT_WITH_RC2_CBC_40_SHA",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_EXPORT_WITH_RC4_40_SHA": {
		Name:     "TLS_KRB5_EXPORT_WITH_RC4_40_SHA",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_EXPORT_WITH_DES_CBC_40_MD5": {
		Name:     "TLS_KRB5_EXPORT_WITH_DES_CBC_40_MD5",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_EXPORT_WITH_RC2_CBC_40_MD5": {
		Name:     "TLS_KRB5_EXPORT_WITH_RC2_CBC_40_MD5",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_EXPORT_WITH_RC4_40_MD5": {
		Name:     "TLS_KRB5_EXPORT_WITH_RC4_40_MD5",
		Reason:   "EXPORT-grade cipher with 40-bit key; trivially broken.",
		Severity: SeverityCritical,
	},
	// ── RC4 ──────────────────────────────────────────────────────────────────
	// Stream cipher with known statistical biases. Prohibited by RFC 7465.
	"TLS_RSA_WITH_RC4_128_MD5": {
		Name:     "TLS_RSA_WITH_RC4_128_MD5",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_RSA_WITH_RC4_128_SHA": {
		Name:     "TLS_RSA_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_RSA_WITH_RC4_128_SHA": {
		Name:     "TLS_ECDHE_RSA_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_ECDSA_WITH_RC4_128_SHA": {
		Name:     "TLS_ECDHE_ECDSA_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_ECDH_RSA_WITH_RC4_128_SHA": {
		Name:     "TLS_ECDH_RSA_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_ECDH_ECDSA_WITH_RC4_128_SHA": {
		Name:     "TLS_ECDH_ECDSA_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_RC4_128_MD5": {
		Name:     "TLS_DH_anon_WITH_RC4_128_MD5",
		Reason:   "RC4 is broken (RFC 7465); anonymous key exchange provides no authentication.",
		Severity: SeverityCritical,
	},
	"TLS_ECDH_anon_WITH_RC4_128_SHA": {
		Name:     "TLS_ECDH_anon_WITH_RC4_128_SHA",
		Reason:   "RC4 is broken (RFC 7465); anonymous key exchange provides no authentication.",
		Severity: SeverityCritical,
	},
	"TLS_PSK_WITH_RC4_128_SHA": {
		Name:     "TLS_PSK_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_DHE_PSK_WITH_RC4_128_SHA": {
		Name:     "TLS_DHE_PSK_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_RSA_PSK_WITH_RC4_128_SHA": {
		Name:     "TLS_RSA_PSK_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_PSK_WITH_RC4_128_SHA": {
		Name:     "TLS_ECDHE_PSK_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_DHE_DSS_WITH_RC4_128_SHA": {
		Name:     "TLS_DHE_DSS_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_WITH_RC4_128_SHA": {
		Name:     "TLS_KRB5_WITH_RC4_128_SHA",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_WITH_RC4_128_MD5": {
		Name:     "TLS_KRB5_WITH_RC4_128_MD5",
		Reason:   "RC4 is cryptographically broken and prohibited in TLS (RFC 7465).",
		Severity: SeverityCritical,
	},
	// ── DES (56-bit) ─────────────────────────────────────────────────────────
	// 56-bit key is brutable in hours on commodity hardware.
	"TLS_RSA_WITH_DES_CBC_SHA": {
		Name:     "TLS_RSA_WITH_DES_CBC_SHA",
		Reason:   "DES has a 56-bit key; brute-forceable on commodity hardware.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_RSA_WITH_DES_CBC_SHA": {
		Name:     "TLS_DHE_RSA_WITH_DES_CBC_SHA",
		Reason:   "DES has a 56-bit key; brute-forceable on commodity hardware.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_DSS_WITH_DES_CBC_SHA": {
		Name:     "TLS_DHE_DSS_WITH_DES_CBC_SHA",
		Reason:   "DES has a 56-bit key; brute-forceable on commodity hardware.",
		Severity: SeverityCritical,
	},
	"TLS_DH_RSA_WITH_DES_CBC_SHA": {
		Name:     "TLS_DH_RSA_WITH_DES_CBC_SHA",
		Reason:   "DES has a 56-bit key; brute-forceable on commodity hardware.",
		Severity: SeverityCritical,
	},
	"TLS_DH_DSS_WITH_DES_CBC_SHA": {
		Name:     "TLS_DH_DSS_WITH_DES_CBC_SHA",
		Reason:   "DES has a 56-bit key; brute-forceable on commodity hardware.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_DES_CBC_SHA": {
		Name:     "TLS_DH_anon_WITH_DES_CBC_SHA",
		Reason:   "DES has a 56-bit key; anonymous key exchange provides no authentication.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_WITH_DES_CBC_SHA": {
		Name:     "TLS_KRB5_WITH_DES_CBC_SHA",
		Reason:   "DES has a 56-bit key; brute-forceable on commodity hardware.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_WITH_DES_CBC_MD5": {
		Name:     "TLS_KRB5_WITH_DES_CBC_MD5",
		Reason:   "DES has a 56-bit key; brute-forceable on commodity hardware.",
		Severity: SeverityCritical,
	},
	// ── 3DES ─────────────────────────────────────────────────────────────────
	// 64-bit block size makes it vulnerable to the SWEET32 birthday attack
	// (~785 GB of traffic in a single session). Deprecated by RFC 7525.
	"TLS_RSA_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32. No forward secrecy.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_RSA_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_DHE_RSA_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_DH_RSA_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_DH_RSA_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32. No forward secrecy.",
		Severity: SeverityCritical,
	},
	"TLS_DH_DSS_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_DH_DSS_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32. No forward secrecy.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_DH_anon_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES is vulnerable to SWEET32; anonymous key exchange provides no authentication.",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_ECDSA_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_ECDHE_ECDSA_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_ECDH_RSA_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_ECDH_RSA_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES is vulnerable to SWEET32. Static ECDH provides no forward secrecy.",
		Severity: SeverityCritical,
	},
	"TLS_ECDH_ECDSA_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_ECDH_ECDSA_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES is vulnerable to SWEET32. Static ECDH provides no forward secrecy.",
		Severity: SeverityCritical,
	},
	"TLS_ECDH_anon_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_ECDH_anon_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES is vulnerable to SWEET32; anonymous key exchange provides no authentication.",
		Severity: SeverityCritical,
	},
	"TLS_PSK_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_PSK_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_DHE_PSK_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_DHE_PSK_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_PSK_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_RSA_PSK_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_ECDHE_PSK_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_ECDHE_PSK_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_SRP_SHA_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_SRP_SHA_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_SRP_SHA_RSA_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_SRP_SHA_RSA_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_SRP_SHA_DSS_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_SRP_SHA_DSS_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_WITH_3DES_EDE_CBC_SHA": {
		Name:     "TLS_KRB5_WITH_3DES_EDE_CBC_SHA",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_WITH_3DES_EDE_CBC_MD5": {
		Name:     "TLS_KRB5_WITH_3DES_EDE_CBC_MD5",
		Reason:   "3DES has a 64-bit block size; vulnerable to SWEET32.",
		Severity: SeverityCritical,
	},
	// ── IDEA ─────────────────────────────────────────────────────────────────
	// 64-bit block size (same SWEET32 concern as 3DES). Removed from TLS 1.2.
	"TLS_RSA_WITH_IDEA_CBC_SHA": {
		Name:     "TLS_RSA_WITH_IDEA_CBC_SHA",
		Reason:   "IDEA has a 64-bit block size; removed from TLS 1.2. No forward secrecy.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_WITH_IDEA_CBC_SHA": {
		Name:     "TLS_KRB5_WITH_IDEA_CBC_SHA",
		Reason:   "IDEA has a 64-bit block size; removed from TLS 1.2.",
		Severity: SeverityCritical,
	},
	"TLS_KRB5_WITH_IDEA_CBC_MD5": {
		Name:     "TLS_KRB5_WITH_IDEA_CBC_MD5",
		Reason:   "IDEA has a 64-bit block size; removed from TLS 1.2.",
		Severity: SeverityCritical,
	},
	// ── Anonymous key exchange (no authentication) ───────────────────────────
	// Vulnerable to trivial man-in-the-middle attacks.
	"TLS_DH_anon_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_DH_anon_WITH_AES_128_CBC_SHA",
		Reason:   "Anonymous DH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_DH_anon_WITH_AES_256_CBC_SHA",
		Reason:   "Anonymous DH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_DH_anon_WITH_AES_128_CBC_SHA256",
		Reason:   "Anonymous DH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_AES_256_CBC_SHA256": {
		Name:     "TLS_DH_anon_WITH_AES_256_CBC_SHA256",
		Reason:   "Anonymous DH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_DH_anon_WITH_AES_128_GCM_SHA256",
		Reason:   "Anonymous DH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_DH_anon_WITH_AES_256_GCM_SHA384",
		Reason:   "Anonymous DH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	"TLS_ECDH_anon_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_ECDH_anon_WITH_AES_128_CBC_SHA",
		Reason:   "Anonymous ECDH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	"TLS_ECDH_anon_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_ECDH_anon_WITH_AES_256_CBC_SHA",
		Reason:   "Anonymous ECDH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_CAMELLIA_128_CBC_SHA": {
		Name:     "TLS_DH_anon_WITH_CAMELLIA_128_CBC_SHA",
		Reason:   "Anonymous DH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_CAMELLIA_256_CBC_SHA": {
		Name:     "TLS_DH_anon_WITH_CAMELLIA_256_CBC_SHA",
		Reason:   "Anonymous DH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_CAMELLIA_128_CBC_SHA256": {
		Name:     "TLS_DH_anon_WITH_CAMELLIA_128_CBC_SHA256",
		Reason:   "Anonymous DH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	"TLS_DH_anon_WITH_SEED_CBC_SHA": {
		Name:     "TLS_DH_anon_WITH_SEED_CBC_SHA",
		Reason:   "Anonymous DH provides no server authentication; trivial MITM.",
		Severity: SeverityCritical,
	},
	// ── GOST ─────────────────────────────────────────────────────────────────
	// Non-standard, Russian government ciphers. Not widely audited outside
	// GOST certification bodies; interoperability concerns.
	"TLS_GOSTR341094_WITH_28147_CNT_IMIT": {
		Name:     "TLS_GOSTR341094_WITH_28147_CNT_IMIT",
		Reason:   "GOST R 34.10-94 is obsolete; limited audit and interoperability.",
		Severity: SeverityCritical,
	},
	"TLS_GOSTR341001_WITH_28147_CNT_IMIT": {
		Name:     "TLS_GOSTR341001_WITH_28147_CNT_IMIT",
		Reason:   "Non-standard GOST cipher; limited audit and interoperability.",
		Severity: SeverityWarning,
	},
	"TLS_GOSTR341094_RSA_WITH_28147_CNT_MD5": {
		Name:     "TLS_GOSTR341094_RSA_WITH_28147_CNT_MD5",
		Reason:   "GOST R 34.10-94 is obsolete; uses MD5.",
		Severity: SeverityCritical,
	},
	"TLS_RSA_WITH_28147_CNT_GOST94": {
		Name:     "TLS_RSA_WITH_28147_CNT_GOST94",
		Reason:   "Non-standard GOST cipher with static RSA; limited audit.",
		Severity: SeverityCritical,
	},
	// ── Draft/old ChaCha20-Poly1305 ──────────────────────────────────────────
	// Pre-RFC 7905 draft identifiers used by older OpenSSL builds.
	"TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256_OLD": {
		Name:     "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256_OLD",
		Reason:   "Draft ChaCha20-Poly1305 identifier (pre-RFC 7905); upgrade to the standard suite.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256_OLD": {
		Name:     "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256_OLD",
		Reason:   "Draft ChaCha20-Poly1305 identifier (pre-RFC 7905); upgrade to the standard suite.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_RSA_WITH_CHACHA20_POLY1305_SHA256_OLD": {
		Name:     "TLS_DHE_RSA_WITH_CHACHA20_POLY1305_SHA256_OLD",
		Reason:   "Draft ChaCha20-Poly1305 identifier (pre-RFC 7905); upgrade to the standard suite.",
		Severity: SeverityWarning,
	},
	// ═════════════════════════════════════════════════════════════════════════
	// WARNING — functional but weak; should be phased out
	// ═════════════════════════════════════════════════════════════════════════

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
	"TLS_RSA_WITH_AES_256_CBC_SHA256": {
		Name:     "TLS_RSA_WITH_AES_256_CBC_SHA256",
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
	"TLS_RSA_WITH_AES_128_CCM": {
		Name:     "TLS_RSA_WITH_AES_128_CCM",
		Reason:   "Static RSA key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_WITH_AES_256_CCM": {
		Name:     "TLS_RSA_WITH_AES_256_CCM",
		Reason:   "Static RSA key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_WITH_AES_128_CCM_8": {
		Name:     "TLS_RSA_WITH_AES_128_CCM_8",
		Reason:   "Static RSA key exchange provides no forward secrecy; CCM-8 has a truncated authentication tag.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_WITH_AES_256_CCM_8": {
		Name:     "TLS_RSA_WITH_AES_256_CCM_8",
		Reason:   "Static RSA key exchange provides no forward secrecy; CCM-8 has a truncated authentication tag.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_WITH_CAMELLIA_128_CBC_SHA": {
		Name:     "TLS_RSA_WITH_CAMELLIA_128_CBC_SHA",
		Reason:   "Static RSA key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_WITH_CAMELLIA_256_CBC_SHA": {
		Name:     "TLS_RSA_WITH_CAMELLIA_256_CBC_SHA",
		Reason:   "Static RSA key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_WITH_CAMELLIA_128_CBC_SHA256": {
		Name:     "TLS_RSA_WITH_CAMELLIA_128_CBC_SHA256",
		Reason:   "Static RSA key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_WITH_SEED_CBC_SHA": {
		Name:     "TLS_RSA_WITH_SEED_CBC_SHA",
		Reason:   "Static RSA key exchange provides no forward secrecy; SEED is a legacy cipher.",
		Severity: SeverityWarning,
	},
	// ── Static DH key exchange (no forward secrecy) ──────────────────────────
	"TLS_DH_RSA_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_DH_RSA_WITH_AES_128_CBC_SHA",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_RSA_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_DH_RSA_WITH_AES_256_CBC_SHA",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_DSS_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_DH_DSS_WITH_AES_128_CBC_SHA",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_DSS_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_DH_DSS_WITH_AES_256_CBC_SHA",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_RSA_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_DH_RSA_WITH_AES_128_CBC_SHA256",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_RSA_WITH_AES_256_CBC_SHA256": {
		Name:     "TLS_DH_RSA_WITH_AES_256_CBC_SHA256",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_DSS_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_DH_DSS_WITH_AES_128_CBC_SHA256",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_DSS_WITH_AES_256_CBC_SHA256": {
		Name:     "TLS_DH_DSS_WITH_AES_256_CBC_SHA256",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_RSA_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_DH_RSA_WITH_AES_128_GCM_SHA256",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_RSA_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_DH_RSA_WITH_AES_256_GCM_SHA384",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_DSS_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_DH_DSS_WITH_AES_128_GCM_SHA256",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_DSS_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_DH_DSS_WITH_AES_256_GCM_SHA384",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_RSA_WITH_CAMELLIA_128_CBC_SHA": {
		Name:     "TLS_DH_RSA_WITH_CAMELLIA_128_CBC_SHA",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_RSA_WITH_CAMELLIA_256_CBC_SHA": {
		Name:     "TLS_DH_RSA_WITH_CAMELLIA_256_CBC_SHA",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_DSS_WITH_CAMELLIA_128_CBC_SHA": {
		Name:     "TLS_DH_DSS_WITH_CAMELLIA_128_CBC_SHA",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_DSS_WITH_CAMELLIA_256_CBC_SHA": {
		Name:     "TLS_DH_DSS_WITH_CAMELLIA_256_CBC_SHA",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_RSA_WITH_CAMELLIA_128_CBC_SHA256": {
		Name:     "TLS_DH_RSA_WITH_CAMELLIA_128_CBC_SHA256",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_DSS_WITH_CAMELLIA_128_CBC_SHA256": {
		Name:     "TLS_DH_DSS_WITH_CAMELLIA_128_CBC_SHA256",
		Reason:   "Static DH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DH_RSA_WITH_SEED_CBC_SHA": {
		Name:     "TLS_DH_RSA_WITH_SEED_CBC_SHA",
		Reason:   "Static DH key exchange provides no forward secrecy; SEED is a legacy cipher.",
		Severity: SeverityWarning,
	},
	"TLS_DH_DSS_WITH_SEED_CBC_SHA": {
		Name:     "TLS_DH_DSS_WITH_SEED_CBC_SHA",
		Reason:   "Static DH key exchange provides no forward secrecy; SEED is a legacy cipher.",
		Severity: SeverityWarning,
	},
	// ── Static ECDH key exchange (no forward secrecy) ────────────────────────
	"TLS_ECDH_RSA_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_ECDH_RSA_WITH_AES_128_CBC_SHA",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_RSA_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_ECDH_RSA_WITH_AES_256_CBC_SHA",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_ECDSA_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_ECDH_ECDSA_WITH_AES_128_CBC_SHA",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_ECDSA_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_ECDH_ECDSA_WITH_AES_256_CBC_SHA",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_RSA_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_ECDH_RSA_WITH_AES_128_CBC_SHA256",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_RSA_WITH_AES_256_CBC_SHA384": {
		Name:     "TLS_ECDH_RSA_WITH_AES_256_CBC_SHA384",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_ECDSA_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_ECDH_ECDSA_WITH_AES_128_CBC_SHA256",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_ECDSA_WITH_AES_256_CBC_SHA384": {
		Name:     "TLS_ECDH_ECDSA_WITH_AES_256_CBC_SHA384",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_RSA_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_ECDH_RSA_WITH_AES_128_GCM_SHA256",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_RSA_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_ECDH_RSA_WITH_AES_256_GCM_SHA384",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_ECDSA_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_ECDH_ECDSA_WITH_AES_128_GCM_SHA256",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_ECDSA_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_ECDH_ECDSA_WITH_AES_256_GCM_SHA384",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_RSA_WITH_CAMELLIA_128_CBC_SHA256": {
		Name:     "TLS_ECDH_RSA_WITH_CAMELLIA_128_CBC_SHA256",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_RSA_WITH_CAMELLIA_256_CBC_SHA384": {
		Name:     "TLS_ECDH_RSA_WITH_CAMELLIA_256_CBC_SHA384",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_ECDSA_WITH_CAMELLIA_128_CBC_SHA256": {
		Name:     "TLS_ECDH_ECDSA_WITH_CAMELLIA_128_CBC_SHA256",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDH_ECDSA_WITH_CAMELLIA_256_CBC_SHA384": {
		Name:     "TLS_ECDH_ECDSA_WITH_CAMELLIA_256_CBC_SHA384",
		Reason:   "Static ECDH key exchange provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	// ── DHE + CBC (forward secrecy but no AEAD) ──────────────────────────────
	"TLS_DHE_RSA_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_DHE_RSA_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption. Prefer DHE+AES-GCM.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_RSA_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_DHE_RSA_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption. Prefer DHE+AES-GCM.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_RSA_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_DHE_RSA_WITH_AES_128_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption. Prefer DHE+AES-GCM.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_RSA_WITH_AES_256_CBC_SHA256": {
		Name:     "TLS_DHE_RSA_WITH_AES_256_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption. Prefer DHE+AES-GCM.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_DSS_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_DHE_DSS_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; DSS is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_DSS_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_DHE_DSS_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; DSS is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_DSS_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_DHE_DSS_WITH_AES_128_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption; DSS is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_DSS_WITH_AES_256_CBC_SHA256": {
		Name:     "TLS_DHE_DSS_WITH_AES_256_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption; DSS is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_RSA_WITH_CAMELLIA_128_CBC_SHA": {
		Name:     "TLS_DHE_RSA_WITH_CAMELLIA_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_RSA_WITH_CAMELLIA_256_CBC_SHA": {
		Name:     "TLS_DHE_RSA_WITH_CAMELLIA_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_DSS_WITH_CAMELLIA_128_CBC_SHA": {
		Name:     "TLS_DHE_DSS_WITH_CAMELLIA_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; DSS is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_DSS_WITH_CAMELLIA_256_CBC_SHA": {
		Name:     "TLS_DHE_DSS_WITH_CAMELLIA_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; DSS is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_RSA_WITH_CAMELLIA_128_CBC_SHA256": {
		Name:     "TLS_DHE_RSA_WITH_CAMELLIA_128_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_DSS_WITH_CAMELLIA_128_CBC_SHA256": {
		Name:     "TLS_DHE_DSS_WITH_CAMELLIA_128_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption; DSS is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_RSA_WITH_SEED_CBC_SHA": {
		Name:     "TLS_DHE_RSA_WITH_SEED_CBC_SHA",
		Reason:   "SEED is a legacy cipher; CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_DSS_WITH_SEED_CBC_SHA": {
		Name:     "TLS_DHE_DSS_WITH_SEED_CBC_SHA",
		Reason:   "SEED is a legacy cipher; CBC mode without authenticated encryption; DSS is rarely used.",
		Severity: SeverityWarning,
	},
	// ── ECDHE + CBC (forward secrecy but no AEAD) ────────────────────────────
	"TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384": {
		Name:     "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384",
		Reason:   "CBC mode without authenticated encryption. Prefer ECDHE+AES-GCM or ChaCha20-Poly1305.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_RSA_WITH_CAMELLIA_128_CBC_SHA256": {
		Name:     "TLS_ECDHE_RSA_WITH_CAMELLIA_128_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_RSA_WITH_CAMELLIA_256_CBC_SHA384": {
		Name:     "TLS_ECDHE_RSA_WITH_CAMELLIA_256_CBC_SHA384",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_ECDSA_WITH_CAMELLIA_128_CBC_SHA256": {
		Name:     "TLS_ECDHE_ECDSA_WITH_CAMELLIA_128_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_ECDSA_WITH_CAMELLIA_256_CBC_SHA384": {
		Name:     "TLS_ECDHE_ECDSA_WITH_CAMELLIA_256_CBC_SHA384",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	// ── PSK + CBC (no AEAD) ──────────────────────────────────────────────────
	"TLS_PSK_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_PSK_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; PSK provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_PSK_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_PSK_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; PSK provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_PSK_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_DHE_PSK_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_PSK_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_DHE_PSK_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_PSK_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_RSA_PSK_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; static RSA provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_RSA_PSK_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_RSA_PSK_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; static RSA provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_PSK_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_ECDHE_PSK_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_PSK_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_ECDHE_PSK_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_PSK_WITH_AES_128_CBC_SHA256": {
		Name:     "TLS_ECDHE_PSK_WITH_AES_128_CBC_SHA256",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_PSK_WITH_AES_256_CBC_SHA384": {
		Name:     "TLS_ECDHE_PSK_WITH_AES_256_CBC_SHA384",
		Reason:   "CBC mode without authenticated encryption.",
		Severity: SeverityWarning,
	},
	// ── SRP + CBC ────────────────────────────────────────────────────────────
	"TLS_SRP_SHA_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_SRP_SHA_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; SRP is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_SRP_SHA_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_SRP_SHA_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; SRP is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_SRP_SHA_RSA_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_SRP_SHA_RSA_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; SRP is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_SRP_SHA_RSA_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_SRP_SHA_RSA_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; SRP is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_SRP_SHA_DSS_WITH_AES_128_CBC_SHA": {
		Name:     "TLS_SRP_SHA_DSS_WITH_AES_128_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; SRP+DSS is rarely used.",
		Severity: SeverityWarning,
	},
	"TLS_SRP_SHA_DSS_WITH_AES_256_CBC_SHA": {
		Name:     "TLS_SRP_SHA_DSS_WITH_AES_256_CBC_SHA",
		Reason:   "CBC mode without authenticated encryption; SRP+DSS is rarely used.",
		Severity: SeverityWarning,
	},
	// ── DHE + CCM-8 (truncated tag) ──────────────────────────────────────────
	"TLS_DHE_RSA_WITH_AES_128_CCM_8": {
		Name:     "TLS_DHE_RSA_WITH_AES_128_CCM_8",
		Reason:   "CCM-8 has a truncated 8-byte authentication tag; reduced integrity assurance.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_RSA_WITH_AES_256_CCM_8": {
		Name:     "TLS_DHE_RSA_WITH_AES_256_CCM_8",
		Reason:   "CCM-8 has a truncated 8-byte authentication tag; reduced integrity assurance.",
		Severity: SeverityWarning,
	},
	"TLS_PSK_WITH_AES_128_CCM": {
		Name:     "TLS_PSK_WITH_AES_128_CCM",
		Reason:   "PSK provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_PSK_WITH_AES_256_CCM": {
		Name:     "TLS_PSK_WITH_AES_256_CCM",
		Reason:   "PSK provides no forward secrecy.",
		Severity: SeverityWarning,
	},
	"TLS_PSK_WITH_AES_128_CCM_8": {
		Name:     "TLS_PSK_WITH_AES_128_CCM_8",
		Reason:   "PSK provides no forward secrecy; CCM-8 has a truncated authentication tag.",
		Severity: SeverityWarning,
	},
	"TLS_PSK_WITH_AES_256_CCM_8": {
		Name:     "TLS_PSK_WITH_AES_256_CCM_8",
		Reason:   "PSK provides no forward secrecy; CCM-8 has a truncated authentication tag.",
		Severity: SeverityWarning,
	},
	"TLS_PSK_DHE_WITH_AES_128_CCM_8": {
		Name:     "TLS_PSK_DHE_WITH_AES_128_CCM_8",
		Reason:   "CCM-8 has a truncated 8-byte authentication tag; reduced integrity assurance.",
		Severity: SeverityWarning,
	},
	"TLS_PSK_DHE_WITH_AES_256_CCM_8": {
		Name:     "TLS_PSK_DHE_WITH_AES_256_CCM_8",
		Reason:   "CCM-8 has a truncated 8-byte authentication tag; reduced integrity assurance.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_128_CCM_8": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_128_CCM_8",
		Reason:   "CCM-8 has a truncated 8-byte authentication tag; reduced integrity assurance.",
		Severity: SeverityWarning,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_256_CCM_8": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_256_CCM_8",
		Reason:   "CCM-8 has a truncated 8-byte authentication tag; reduced integrity assurance.",
		Severity: SeverityWarning,
	},
	// ── DHE + DSS + GCM ──────────────────────────────────────────────────────
	// AEAD is fine, but DSS/DSA keys are rarely deployed and being phased out.
	"TLS_DHE_DSS_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_DHE_DSS_WITH_AES_128_GCM_SHA256",
		Reason:   "AEAD with forward secrecy, but DSS/DSA is rarely used and being phased out.",
		Severity: SeverityWarning,
	},
	"TLS_DHE_DSS_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_DHE_DSS_WITH_AES_256_GCM_SHA384",
		Reason:   "AEAD with forward secrecy, but DSS/DSA is rarely used and being phased out.",
		Severity: SeverityWarning,
	},
	// ═════════════════════════════════════════════════════════════════════════
	// OK — modern, recommended configurations
	// ═════════════════════════════════════════════════════════════════════════

	// ── DHE + AEAD ───────────────────────────────────────────────────────────
	"TLS_DHE_RSA_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_DHE_RSA_WITH_AES_128_GCM_SHA256",
		Reason:   "Forward secrecy with AES-128-GCM (AEAD). Recommended when ECDHE is unavailable.",
		Severity: SeverityOK,
	},
	"TLS_DHE_RSA_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_DHE_RSA_WITH_AES_256_GCM_SHA384",
		Reason:   "Forward secrecy with AES-256-GCM (AEAD). Recommended when ECDHE is unavailable.",
		Severity: SeverityOK,
	},
	"TLS_DHE_RSA_WITH_AES_128_CCM": {
		Name:     "TLS_DHE_RSA_WITH_AES_128_CCM",
		Reason:   "Forward secrecy with AES-128-CCM (AEAD).",
		Severity: SeverityOK,
	},
	"TLS_DHE_RSA_WITH_AES_256_CCM": {
		Name:     "TLS_DHE_RSA_WITH_AES_256_CCM",
		Reason:   "Forward secrecy with AES-256-CCM (AEAD).",
		Severity: SeverityOK,
	},
	"TLS_DHE_RSA_WITH_CHACHA20_POLY1305_SHA256": {
		Name:     "TLS_DHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
		Reason:   "Forward secrecy with ChaCha20-Poly1305 (AEAD).",
		Severity: SeverityOK,
	},
	"TLS_DHE_PSK_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_DHE_PSK_WITH_AES_128_GCM_SHA256",
		Reason:   "Forward secrecy with AES-128-GCM (AEAD).",
		Severity: SeverityOK,
	},
	"TLS_DHE_PSK_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_DHE_PSK_WITH_AES_256_GCM_SHA384",
		Reason:   "Forward secrecy with AES-256-GCM (AEAD).",
		Severity: SeverityOK,
	},
	"TLS_DHE_PSK_WITH_AES_128_CCM": {
		Name:     "TLS_DHE_PSK_WITH_AES_128_CCM",
		Reason:   "Forward secrecy with AES-128-CCM (AEAD).",
		Severity: SeverityOK,
	},
	"TLS_DHE_PSK_WITH_AES_256_CCM": {
		Name:     "TLS_DHE_PSK_WITH_AES_256_CCM",
		Reason:   "Forward secrecy with AES-256-CCM (AEAD).",
		Severity: SeverityOK,
	},
	"TLS_DHE_PSK_WITH_CHACHA20_POLY1305_SHA256": {
		Name:     "TLS_DHE_PSK_WITH_CHACHA20_POLY1305_SHA256",
		Reason:   "Forward secrecy with ChaCha20-Poly1305 (AEAD).",
		Severity: SeverityOK,
	},
	// ── ECDHE + AEAD (recommended) ───────────────────────────────────────────
	// Forward secrecy via ephemeral ECDH key exchange and authenticated
	// encryption via GCM, CCM, or ChaCha20-Poly1305.
	"TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
		Reason:   "Forward secrecy with AES-128-GCM (AEAD). Recommended.",
		Severity: SeverityOK,
	},
	"TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384": {
		Name:     "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
		Reason:   "Forward secrecy with AES-256-GCM (AEAD). Recommended.",
		Severity: SeverityOK,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
		Reason:   "Forward secrecy with AES-128-GCM (AEAD). Recommended.",
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
	"TLS_ECDHE_ECDSA_WITH_AES_128_CCM": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_128_CCM",
		Reason:   "Forward secrecy with AES-128-CCM (AEAD).",
		Severity: SeverityOK,
	},
	"TLS_ECDHE_ECDSA_WITH_AES_256_CCM": {
		Name:     "TLS_ECDHE_ECDSA_WITH_AES_256_CCM",
		Reason:   "Forward secrecy with AES-256-CCM (AEAD).",
		Severity: SeverityOK,
	},
	"TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256": {
		Name:     "TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256",
		Reason:   "Forward secrecy with ChaCha20-Poly1305 (AEAD).",
		Severity: SeverityOK,
	},
	"TLS_PSK_WITH_CHACHA20_POLY1305_SHA256": {
		Name:     "TLS_PSK_WITH_CHACHA20_POLY1305_SHA256",
		Reason:   "ChaCha20-Poly1305 (AEAD); note PSK alone provides no forward secrecy.",
		Severity: SeverityOK,
	},
	"TLS_RSA_PSK_WITH_CHACHA20_POLY1305_SHA256": {
		Name:     "TLS_RSA_PSK_WITH_CHACHA20_POLY1305_SHA256",
		Reason:   "ChaCha20-Poly1305 (AEAD); note RSA-PSK provides no forward secrecy.",
		Severity: SeverityOK,
	},
	// ── TLS 1.3 suites ───────────────────────────────────────────────────────
	// TLS 1.3 mandates AEAD-only cipher suites with forward secrecy built
	// into the handshake. These are the strongest suites available.
	"TLS_AES_128_GCM_SHA256": {
		Name:     "TLS_AES_128_GCM_SHA256",
		Reason:   "TLS 1.3 mandatory suite. AEAD with built-in forward secrecy.",
		Severity: SeverityOK,
	},
	"TLS_AES_256_GCM_SHA384": {
		Name:     "TLS_AES_256_GCM_SHA384",
		Reason:   "TLS 1.3 suite. AEAD with built-in forward secrecy.",
		Severity: SeverityOK,
	},
	"TLS_CHACHA20_POLY1305_SHA256": {
		Name:     "TLS_CHACHA20_POLY1305_SHA256",
		Reason:   "TLS 1.3 suite. AEAD with built-in forward secrecy; preferred on hardware without AES acceleration.",
		Severity: SeverityOK,
	},
}

// CipherSeverity returns the severity of a single cipher suite name.
// Returns SeverityOK for unknown suites (not a known-weak cipher).
func CipherSeverity(name string) Severity {
	if f, ok := cipherClassifications[name]; ok {
		return f.Severity
	}
	return SeverityOK
}

// CipherReason returns the human-readable reason for a cipher suite's classification.
func CipherReason(name string) string {
	if f, ok := cipherClassifications[name]; ok {
		return f.Reason
	}
	return "Not a known-weak cipher suite; verify against your organisation's policy."
}
