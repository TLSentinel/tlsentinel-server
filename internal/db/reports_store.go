package db

import (
	"context"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/tlsprofile"
)

// GetTLSPostureReport returns aggregated TLS posture data across all enabled
// endpoints that have at least one TLS profile scan.
func (s *Store) GetTLSPostureReport(ctx context.Context) (models.TLSPostureReport, error) {
	var report models.TLSPostureReport

	// ── Total and scanned endpoint counts ────────────────────────────────────
	if err := s.db.NewSelect().
		TableExpr("tlsentinel.endpoints e").
		ColumnExpr("COUNT(*) AS total").
		ColumnExpr("COUNT(p.endpoint_id) AS scanned").
		Join("LEFT JOIN tlsentinel.endpoint_tls_profiles p ON p.endpoint_id = e.id").
		Where("e.enabled = TRUE").
		Scan(ctx, &report.TotalEndpoints, &report.ScannedEndpoints); err != nil {
		return report, fmt.Errorf("reports: count endpoints: %w", err)
	}

	// ── Protocol distribution (highest supported version per endpoint) ────────
	type protocolRow struct {
		TLS13 int `bun:"tls13"`
		TLS12 int `bun:"tls12"`
		TLS11 int `bun:"tls11"`
		TLS10 int `bun:"tls10"`
	}
	var proto protocolRow
	if err := s.db.NewSelect().
		TableExpr("tlsentinel.endpoint_tls_profiles").
		ColumnExpr("COUNT(*) FILTER (WHERE tls13) AS tls13").
		ColumnExpr("COUNT(*) FILTER (WHERE tls12) AS tls12").
		ColumnExpr("COUNT(*) FILTER (WHERE tls11) AS tls11").
		ColumnExpr("COUNT(*) FILTER (WHERE tls10) AS tls10").
		Where("scan_error IS NULL").
		Scan(ctx, &proto); err != nil {
		return report, fmt.Errorf("reports: protocol counts: %w", err)
	}
	report.Protocols = models.TLSProtocolCounts{
		TLS13: proto.TLS13,
		TLS12: proto.TLS12,
		TLS11: proto.TLS11,
		TLS10: proto.TLS10,
	}

	// ── Legacy endpoint count (tls10 OR tls11, deduplicated) ──────────────
	var legacyCount int
	if err := s.db.NewSelect().
		TableExpr("tlsentinel.endpoint_tls_profiles").
		ColumnExpr("COUNT(*) FILTER (WHERE tls10 OR tls11)").
		Where("scan_error IS NULL").
		Scan(ctx, &legacyCount); err != nil {
		return report, fmt.Errorf("reports: legacy count: %w", err)
	}
	report.LegacyEndpoints = legacyCount

	// ── Cipher distribution (all supported ciphers per endpoint) ────────────
	// Unnest cipher_suites so every cipher an endpoint *accepts* is counted,
	// not just the one that happened to be negotiated on the last scan.
	type cipherRow struct {
		Cipher string `bun:"cipher"`
		Count  int    `bun:"count"`
	}
	var cipherRows []cipherRow
	if err := s.db.NewSelect().
		TableExpr("tlsentinel.endpoint_tls_profiles, unnest(cipher_suites) AS cipher").
		ColumnExpr("cipher, COUNT(DISTINCT endpoint_id) AS count").
		Where("scan_error IS NULL").
		GroupExpr("cipher").
		OrderExpr("count DESC").
		Scan(ctx, &cipherRows); err != nil {
		return report, fmt.Errorf("reports: cipher counts: %w", err)
	}
	report.Ciphers = make([]models.TLSCipherCount, len(cipherRows))
	for i, r := range cipherRows {
		report.Ciphers[i] = models.TLSCipherCount{
			Cipher:   r.Cipher,
			Count:    r.Count,
			Severity: string(tlsprofile.CipherSeverity(r.Cipher)),
			Reason:   tlsprofile.CipherReason(r.Cipher),
		}
	}

	// ── Issuer distribution (current certs, follow one level up the chain) ───
	type issuerRow struct {
		Issuer string `bun:"issuer"`
		Count  int    `bun:"count"`
	}
	var issuerRows []issuerRow
	if err := s.db.NewSelect().
		TableExpr("tlsentinel.endpoint_certs ec").
		ColumnExpr(`
			CASE
				WHEN c.subject_dn_hash = c.issuer_dn_hash THEN 'Self-signed'
				WHEN ic.common_name IS NOT NULL           THEN ic.common_name
				ELSE 'Unknown CA'
			END AS issuer`).
		ColumnExpr("COUNT(DISTINCT ec.endpoint_id) AS count").
		Join("JOIN tlsentinel.certificates c ON c.fingerprint = ec.fingerprint").
		Join("LEFT JOIN tlsentinel.certificates ic ON ic.fingerprint = c.issuer_fingerprint").
		Where("ec.is_current = TRUE").
		GroupExpr("1").
		OrderExpr("count DESC").
		Limit(10).
		Scan(ctx, &issuerRows); err != nil {
		return report, fmt.Errorf("reports: issuer counts: %w", err)
	}
	report.Issuers = make([]models.TLSIssuerCount, len(issuerRows))
	for i, r := range issuerRows {
		report.Issuers[i] = models.TLSIssuerCount{Issuer: r.Issuer, Count: r.Count}
	}

	// ── Weak cipher count + attention items (single pass over all scanned endpoints) ─
	// Fetching cipher_suites (the full accepted list) rather than selected_cipher
	// (the single negotiated cipher) ensures every weak suite an endpoint accepts
	// is surfaced — not just the one that happened to be negotiated on the last scan.
	type endpointScanRow struct {
		EndpointID   string   `bun:"endpoint_id"`
		EndpointName string   `bun:"endpoint_name"`
		TLS10        bool     `bun:"tls10"`
		TLS11        bool     `bun:"tls11"`
		CipherSuites []string `bun:"cipher_suites,array"`
	}
	var scanRows []endpointScanRow
	if err := s.db.NewSelect().
		TableExpr("tlsentinel.endpoints e").
		ColumnExpr("e.id AS endpoint_id, e.name AS endpoint_name").
		ColumnExpr("p.tls10, p.tls11, p.cipher_suites").
		Join("JOIN tlsentinel.endpoint_tls_profiles p ON p.endpoint_id = e.id").
		Where("e.enabled = TRUE AND p.scan_error IS NULL").
		OrderExpr("CASE WHEN p.tls10 THEN 0 WHEN p.tls11 THEN 1 ELSE 2 END, e.name").
		Scan(ctx, &scanRows); err != nil {
		return report, fmt.Errorf("reports: endpoint scan data: %w", err)
	}

	weakCipherCount := 0
	for _, r := range scanRows {
		hasWeak := false
		for _, c := range r.CipherSuites {
			if tlsprofile.CipherSeverity(c) != tlsprofile.SeverityOK {
				hasWeak = true
				break
			}
		}
		if hasWeak {
			weakCipherCount++
		}

		issues, severity := allAttentionIssues(r.TLS10, r.TLS11, r.CipherSuites)
		if len(issues) == 0 {
			continue
		}
		report.Attention = append(report.Attention, models.TLSAttentionItem{
			EndpointID:   r.EndpointID,
			EndpointName: r.EndpointName,
			Issues:       issues,
			Severity:     severity,
		})
	}
	report.WeakCipherEndpoints = weakCipherCount
	if report.Attention == nil {
		report.Attention = []models.TLSAttentionItem{}
	}

	return report, nil
}

// allAttentionIssues returns every security concern for an endpoint and the
// worst severity across all of them. Returns nil issues if nothing is flagged.
// cipherSuites is the full list of cipher suites the endpoint accepts, not just
// the one negotiated on the last scan.
func allAttentionIssues(tls10, tls11 bool, cipherSuites []string) (issues []string, severity string) {
	worst := tlsprofile.SeverityOK

	if tls10 {
		issues = append(issues, "Supports TLS 1.0")
		worst = tlsprofile.SeverityCritical
	}
	if tls11 {
		issues = append(issues, "Supports TLS 1.1")
		if worst != tlsprofile.SeverityCritical {
			worst = tlsprofile.SeverityWarning
		}
	}

	// Count weak ciphers across the full accepted suite list.
	criticalCount, warningCount := 0, 0
	for _, c := range cipherSuites {
		switch tlsprofile.CipherSeverity(c) {
		case tlsprofile.SeverityCritical:
			criticalCount++
		case tlsprofile.SeverityWarning:
			warningCount++
		}
	}
	if criticalCount > 0 {
		issues = append(issues, fmt.Sprintf("Accepts %d critical cipher suite(s)", criticalCount))
		worst = tlsprofile.SeverityCritical
	}
	if warningCount > 0 {
		issues = append(issues, fmt.Sprintf("Accepts %d weak cipher suite(s)", warningCount))
		if worst == tlsprofile.SeverityOK {
			worst = tlsprofile.SeverityWarning
		}
	}

	if len(issues) == 0 {
		return nil, ""
	}
	return issues, string(worst)
}
