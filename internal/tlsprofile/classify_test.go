package tlsprofile

import (
	"testing"
)

func TestClassify_CleanHost(t *testing.T) {
	result := Classify(false, false, false, true, true, []string{
		"TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
		"TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
		"TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
	})

	if result.OverallSeverity != SeverityOK {
		t.Errorf("expected ok, got %s", result.OverallSeverity)
	}
	// Two supported versions should appear (TLS 1.2 and TLS 1.3).
	if len(result.Versions) != 2 {
		t.Errorf("expected 2 version findings, got %d", len(result.Versions))
	}
	// All three suites are ok — all should appear, none hidden.
	if len(result.CipherSuites) != 3 {
		t.Errorf("expected 3 cipher findings, got %d", len(result.CipherSuites))
	}
	for _, f := range result.CipherSuites {
		if f.Severity != SeverityOK {
			t.Errorf("suite %s: expected ok, got %s", f.Name, f.Severity)
		}
	}
}

func TestClassify_OldProtocols(t *testing.T) {
	result := Classify(false, true, true, true, true, []string{
		"TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
	})

	if result.OverallSeverity != SeverityCritical {
		t.Errorf("expected critical (TLS 1.0 present), got %s", result.OverallSeverity)
	}
	// All four versions supported — all four should appear.
	if len(result.Versions) != 4 {
		t.Errorf("expected 4 version findings, got %d", len(result.Versions))
	}
	if result.Versions[0].Name != "TLS 1.0" {
		t.Errorf("expected TLS 1.0 first (oldest-to-newest order), got %s", result.Versions[0].Name)
	}
	if result.Versions[0].Severity != SeverityCritical {
		t.Errorf("TLS 1.0 should be critical, got %s", result.Versions[0].Severity)
	}
	if result.Versions[2].Severity != SeverityOK {
		t.Errorf("TLS 1.2 should be ok, got %s", result.Versions[2].Severity)
	}
}

func TestClassify_RC4(t *testing.T) {
	result := Classify(false, false, false, true, true, []string{
		"TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
		"TLS_RSA_WITH_RC4_128_SHA",
	})

	if result.OverallSeverity != SeverityCritical {
		t.Errorf("expected critical (RC4 present), got %s", result.OverallSeverity)
	}
	// Both suites should appear; one ok, one critical.
	if len(result.CipherSuites) != 2 {
		t.Errorf("expected 2 cipher findings, got %d", len(result.CipherSuites))
	}
	if result.CipherSuites[0].Severity != SeverityOK {
		t.Errorf("first suite should be ok, got %s", result.CipherSuites[0].Severity)
	}
	if result.CipherSuites[1].Severity != SeverityCritical {
		t.Errorf("RC4 suite should be critical, got %s", result.CipherSuites[1].Severity)
	}
}

func TestClassify_NoForwardSecrecy(t *testing.T) {
	result := Classify(false, false, false, true, false, []string{
		"TLS_RSA_WITH_AES_256_GCM_SHA384",
	})

	if result.OverallSeverity != SeverityWarning {
		t.Errorf("expected warning (no FS), got %s", result.OverallSeverity)
	}
	if len(result.CipherSuites) != 1 || result.CipherSuites[0].Severity != SeverityWarning {
		t.Errorf("expected 1 warning cipher, got %+v", result.CipherSuites)
	}
}

func TestClassify_UnknownSuiteIsVisible(t *testing.T) {
	// An unrecognised suite should appear in CipherSuites (not silently dropped)
	// and be classified as ok with an explanatory note.
	result := Classify(false, false, false, true, true, []string{
		"TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
		"TLS_SOME_FUTURE_SUITE_SHA512",
	})

	if len(result.CipherSuites) != 2 {
		t.Errorf("expected 2 cipher findings (unknown suite should be visible), got %d", len(result.CipherSuites))
	}
	unknown := result.CipherSuites[1]
	if unknown.Name != "TLS_SOME_FUTURE_SUITE_SHA512" {
		t.Errorf("expected unknown suite name, got %s", unknown.Name)
	}
	if unknown.Severity != SeverityOK {
		t.Errorf("unknown suite should default to ok, got %s", unknown.Severity)
	}
}

func TestClassify_VersionOrder(t *testing.T) {
	// Versions should always appear oldest-to-newest regardless of probe order.
	result := Classify(false, true, false, true, true, []string{})

	names := make([]string, len(result.Versions))
	for i, v := range result.Versions {
		names[i] = v.Name
	}
	expected := []string{"TLS 1.0", "TLS 1.2", "TLS 1.3"}
	for i, want := range expected {
		if names[i] != want {
			t.Errorf("version[%d]: want %s, got %s", i, want, names[i])
		}
	}
}

func TestClassify_WorstSeverityWins(t *testing.T) {
	// TLS 1.1 is warning, RC4 is critical — overall must be critical.
	result := Classify(false, false, true, true, true, []string{
		"TLS_RSA_WITH_RC4_128_SHA",
	})

	if result.OverallSeverity != SeverityCritical {
		t.Errorf("expected critical (worst wins), got %s", result.OverallSeverity)
	}
}
