package tlsprofile

import "testing"

func TestNormalizeCipherName_IANAPassthrough(t *testing.T) {
	// IANA names (Go scanner, TLS 1.3 from OpenSSL) must pass through unchanged.
	cases := []string{
		"TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
		"TLS_AES_128_GCM_SHA256",         // TLS 1.3 — OpenSSL already uses IANA
		"TLS_CHACHA20_POLY1305_SHA256",   // TLS 1.3
	}
	for _, name := range cases {
		if got := NormalizeCipherName(name); got != name {
			t.Errorf("IANA name %q should pass through unchanged, got %q", name, got)
		}
	}
}

func TestNormalizeCipherName_OpenSSLTranslation(t *testing.T) {
	cases := []struct {
		openssl string
		iana    string
	}{
		{"ECDHE-RSA-AES128-GCM-SHA256",    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256"},
		{"ECDHE-RSA-AES256-GCM-SHA384",    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"},
		{"ECDHE-RSA-CHACHA20-POLY1305",    "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256"},
		{"ECDHE-ECDSA-CHACHA20-POLY1305",  "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256"},
		{"AES256-SHA",                     "TLS_RSA_WITH_AES_256_CBC_SHA"},
		{"DES-CBC3-SHA",                   "TLS_RSA_WITH_3DES_EDE_CBC_SHA"},
		{"RC4-SHA",                        "TLS_RSA_WITH_RC4_128_SHA"},
		{"ECDHE-RSA-RC4-SHA",              "TLS_ECDHE_RSA_WITH_RC4_128_SHA"},
	}
	for _, c := range cases {
		if got := NormalizeCipherName(c.openssl); got != c.iana {
			t.Errorf("NormalizeCipherName(%q) = %q, want %q", c.openssl, got, c.iana)
		}
	}
}

func TestNormalizeCipherName_UnknownPassthrough(t *testing.T) {
	// Unknown names should pass through so classify.go can surface them.
	unknown := "SOME-FUTURE-CIPHER"
	if got := NormalizeCipherName(unknown); got != unknown {
		t.Errorf("unknown name should pass through, got %q", got)
	}
}

func TestNormalizeCipherNames_Slice(t *testing.T) {
	input := []string{
		"ECDHE-RSA-AES128-GCM-SHA256",
		"TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
		"RC4-SHA",
	}
	got := NormalizeCipherNames(input)
	want := []string{
		"TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
		"TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
		"TLS_RSA_WITH_RC4_128_SHA",
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("[%d] got %q, want %q", i, got[i], want[i])
		}
	}
}

func TestNormalizeCipherNames_DoesNotMutateInput(t *testing.T) {
	input := []string{"ECDHE-RSA-AES128-GCM-SHA256"}
	original := input[0]
	NormalizeCipherNames(input)
	if input[0] != original {
		t.Error("NormalizeCipherNames should not mutate the input slice")
	}
}
