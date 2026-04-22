package db

import (
	"context"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/uptrace/bun"
	"github.com/uptrace/bun/driver/pgdriver"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// ListAllActiveCerts returns a paginated list of active host-certificate pairs.
//
// search filters on endpoint_name, dns_name, or common_name (case-insensitive contains).
// status restricts results by expiry bucket: "expired" (<0), "critical" (0–7), "warning" (8–30), "ok" (>30).
// sort controls ordering: "" or "days_asc" (default), "days_desc", "endpoint_name", "common_name".
// An empty status returns all entries.
func (s *Store) ListAllActiveCerts(ctx context.Context, page, pageSize int, search, status, sort, tagID string) (models.ExpiringCertList, error) {
	var rows []VActiveCertificate

	var orderExpr string
	switch sort {
	case "days_desc":
		orderExpr = "days_remaining DESC"
	case "endpoint_name":
		orderExpr = "endpoint_name ASC"
	case "common_name":
		orderExpr = "common_name ASC"
	default:
		orderExpr = "days_remaining ASC"
	}

	q := s.db.NewSelect().
		Model(&rows).
		OrderExpr(orderExpr).
		Limit(pageSize).
		Offset((page - 1) * pageSize)

	if search != "" {
		pattern := "%" + search + "%"
		q = q.Where("(endpoint_name ILIKE ? OR common_name ILIKE ?)", pattern, pattern)
	}

	switch status {
	case "expired":
		q = q.Where("days_remaining < 0")
	case "critical":
		q = q.Where("days_remaining >= 0 AND days_remaining <= 7")
	case "warning":
		q = q.Where("days_remaining >= 8 AND days_remaining <= 30")
	case "ok":
		q = q.Where("days_remaining > 30")
	}

	if tagID != "" {
		q = q.Where("EXISTS (SELECT 1 FROM tlsentinel.endpoint_tags et WHERE et.endpoint_id = vac.endpoint_id AND et.tag_id = ?)", tagID)
	}

	total, err := q.ScanAndCount(ctx)
	if err != nil {
		return models.ExpiringCertList{}, fmt.Errorf("failed to list active certs: %w", err)
	}

	items := make([]models.ExpiringCertItem, len(rows))
	for i, r := range rows {
		sans := r.SANs
		if sans == nil {
			sans = []string{}
		}
		items[i] = models.ExpiringCertItem{
			EndpointID:    r.EndpointID,
			EndpointName:  r.EndpointName,
			EndpointType:  r.EndpointType,
			Fingerprint:   r.Fingerprint,
			CommonName:    r.CommonName,
			SANs:          sans,
			IssuerCN:      r.IssuerCN,
			NotAfter:      r.NotAfter,
			DaysRemaining: r.DaysRemaining,
			Tags:          []models.TagWithCategory{},
		}
	}

	// Batch-fetch tags for all endpoints on this page.
	if len(items) > 0 {
		endpointIDs := make([]string, len(items))
		for i, item := range items {
			endpointIDs[i] = item.EndpointID
		}
		type tagRow struct {
			EndpointID   string `bun:"endpoint_id"`
			TagID        string `bun:"tag_id"`
			TagName      string `bun:"tag_name"`
			CategoryID   string `bun:"category_id"`
			CategoryName string `bun:"category_name"`
		}
		var tagRows []tagRow
		if err := s.db.NewSelect().
			TableExpr("tlsentinel.endpoint_tags et").
			ColumnExpr("et.endpoint_id, et.tag_id, t.name AS tag_name, t.category_id, tc.name AS category_name").
			Join("JOIN tlsentinel.tags t ON t.id = et.tag_id").
			Join("JOIN tlsentinel.tag_categories tc ON tc.id = t.category_id").
			Where("et.endpoint_id IN (?)", bun.In(endpointIDs)).
			OrderExpr("tc.name ASC, t.name ASC").
			Scan(ctx, &tagRows); err == nil {
			tagsByEndpoint := make(map[string][]models.TagWithCategory)
			for _, tr := range tagRows {
				tagsByEndpoint[tr.EndpointID] = append(tagsByEndpoint[tr.EndpointID], models.TagWithCategory{
					ID:           tr.TagID,
					CategoryID:   tr.CategoryID,
					CategoryName: tr.CategoryName,
					Name:         tr.TagName,
				})
			}
			for i := range items {
				if tags, ok := tagsByEndpoint[items[i].EndpointID]; ok {
					items[i].Tags = tags
				}
			}
		}
	}

	return models.ExpiringCertList{
		Items:      items,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
	}, nil
}

// ListExpiringCerts returns all active certificates whose days_remaining is at or below the given
// threshold, ordered by days remaining ascending (most urgent first).
func (s *Store) ListExpiringCerts(ctx context.Context, daysRemaining int) ([]models.ExpiringCertItem, error) {
	var rows []VActiveCertificate
	err := s.db.NewSelect().
		Model(&rows).
		Where("days_remaining <= ?", daysRemaining).
		OrderExpr("days_remaining ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list expiring certs: %w", err)
	}

	items := make([]models.ExpiringCertItem, len(rows))
	for i, r := range rows {
		sans := r.SANs
		if sans == nil {
			sans = []string{}
		}
		items[i] = models.ExpiringCertItem{
			EndpointID:    r.EndpointID,
			EndpointName:  r.EndpointName,
			EndpointType:  r.EndpointType,
			Fingerprint:   r.Fingerprint,
			CommonName:    r.CommonName,
			SANs:          sans,
			IssuerCN:      r.IssuerCN,
			NotAfter:      r.NotAfter,
			DaysRemaining: r.DaysRemaining,
		}
	}
	return items, nil
}

// ListCertificates returns a paginated list of certificates with optional filters.
//
// status filters by expiry bucket: "expired", "critical" (≤7d), "warning" (≤30d), "ok" (>30d).
// sort controls ordering: "" or "newest" (default), "expiry_asc", "expiry_desc", "common_name".
func (s *Store) ListCertificates(ctx context.Context, page, pageSize int, commonName string, expiringBefore *time.Time, status, sort string) (models.CertificateList, error) {
	var rows []Certificate

	var orderExpr string
	switch sort {
	case "expiry_asc":
		orderExpr = "not_after ASC"
	case "expiry_desc":
		orderExpr = "not_after DESC"
	case "common_name":
		orderExpr = "common_name ASC"
	default:
		orderExpr = "created_at DESC"
	}

	q := s.db.NewSelect().
		Model(&rows).
		OrderExpr(orderExpr).
		Limit(pageSize).
		Offset((page - 1) * pageSize)
	if commonName != "" {
		q = q.Where("common_name ILIKE ?", "%"+commonName+"%")
	}
	if expiringBefore != nil {
		q = q.Where("not_after < ?", expiringBefore)
	}
	switch status {
	case "expired":
		q = q.Where("not_after < NOW()")
	case "critical":
		q = q.Where("not_after >= NOW() AND not_after < NOW() + INTERVAL '7 days'")
	case "warning":
		q = q.Where("not_after >= NOW() + INTERVAL '7 days' AND not_after < NOW() + INTERVAL '30 days'")
	case "ok":
		q = q.Where("not_after >= NOW() + INTERVAL '30 days'")
	}
	total, err := q.ScanAndCount(ctx)
	if err != nil {
		return models.CertificateList{}, fmt.Errorf("failed to list certificates: %w", err)
	}

	items := make([]models.CertificateListItem, len(rows))
	for i, r := range rows {
		items[i] = models.CertificateListItem{
			Fingerprint:       r.Fingerprint,
			CommonName:        r.CommonName,
			SANs:              r.SANs,
			NotBefore:         r.NotBefore,
			NotAfter:          r.NotAfter,
			IssuerFingerprint: r.IssuerFingerprint,
			CreatedAt:         r.CreatedAt,
		}
	}
	return models.CertificateList{
		Items:      items,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
	}, nil
}

func (s *Store) GetCertificate(ctx context.Context, fingerprint string) (models.CertificateDetail, error) {
	var c Certificate
	err := s.db.NewSelect().Model(&c).Where("fingerprint = ?", fingerprint).Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.CertificateDetail{}, ErrNotFound
		}
		return models.CertificateDetail{}, fmt.Errorf("failed to get certificate: %w", err)
	}
	return models.CertificateDetail{
		Fingerprint:       c.Fingerprint,
		PEM:               c.PEM,
		CommonName:        c.CommonName,
		SANs:              c.SANs,
		NotBefore:         c.NotBefore,
		NotAfter:          c.NotAfter,
		SerialNumber:      c.SerialNumber,
		SubjectKeyID:      c.SubjectKeyID,
		AuthorityKeyID:    c.AuthorityKeyID,
		IssuerFingerprint: c.IssuerFingerprint,
		CreatedAt:         c.CreatedAt,
		IsTrustAnchor:     c.TrustAnchor,
	}, nil
}

func (s *Store) GetCertificateHosts(ctx context.Context, fingerprint string) ([]models.EndpointListItem, error) {
	var rows []endpointWithScanner
	err := s.selectEndpointWithScanner().
		Join("JOIN tlsentinel.endpoint_certs AS ecf ON ecf.endpoint_id = h.id AND ecf.is_current = TRUE").
		Where("ecf.fingerprint = ?", fingerprint).
		OrderExpr("h.name ASC").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("failed to query certificate endpoints: %w", err)
	}

	result := make([]models.EndpointListItem, len(rows))
	for i, r := range rows {
		result[i] = endpointRowToListItem(r)
	}
	return result, nil
}

func (s *Store) InsertCertificate(ctx context.Context, rec models.CertificateRecord) (inserted bool, err error) {
	c := &Certificate{
		Fingerprint:    rec.Fingerprint,
		PEM:            rec.PEM,
		CommonName:     rec.CommonName,
		SubjectOrg:     rec.SubjectOrg,
		SubjectOrgUnit: rec.SubjectOrgUnit,
		SANs:           rec.SANs,
		NotBefore:      rec.NotBefore,
		NotAfter:       rec.NotAfter,
		SerialNumber:   rec.SerialNumber,
		SubjectKeyID:   rec.SubjectKeyID,
		AuthorityKeyID: rec.AuthorityKeyID,
		SubjectDNHash:  rec.SubjectDNHash,
		IssuerDNHash:   rec.IssuerDNHash,
	}
	res, err := s.db.NewInsert().Model(c).On("CONFLICT (fingerprint) DO NOTHING").Exec(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to insert certificate: %w", err)
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// ReconcileCertificateChains sets issuer_fingerprint for every certificate whose
// issuer is already present in the database but the link has not yet been established
// (authority_key_id matches another certificate's subject_key_id).
//
// The INSERT trigger handles this automatically for new rows, but this function is
// needed for rows that pre-date the trigger or were inserted before their issuer arrived
// via a code path where ON CONFLICT DO NOTHING silenced the trigger.
//
// It is safe to call repeatedly — only NULL issuer_fingerprints are touched.
// Returns the number of rows updated.
func (s *Store) ReconcileCertificateChains(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE tlsentinel.certificates c
		SET issuer_fingerprint = i.fingerprint
		FROM tlsentinel.certificates i
		WHERE c.authority_key_id   = i.subject_key_id
		  AND c.issuer_dn_hash     = i.subject_dn_hash
		  AND c.fingerprint       != i.fingerprint
		  AND c.issuer_fingerprint IS NULL
		  AND c.authority_key_id  IS NOT NULL`)
	if err != nil {
		return 0, fmt.Errorf("failed to reconcile certificate chains: %w", err)
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// BackfillDNHashes populates subject_dn_hash and issuer_dn_hash for any certificates
// that were inserted before those columns existed. It parses the stored PEM to recompute
// the hashes from the raw DER bytes.
//
// This is a one-time migration aid and can be removed once all deployments have run
// migration 000012 and a sufficient scan cycle has elapsed.
func (s *Store) BackfillDNHashes(ctx context.Context) (int64, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT fingerprint, pem FROM tlsentinel.certificates WHERE subject_dn_hash = ''`)
	if err != nil {
		return 0, fmt.Errorf("failed to query certificates for dn hash backfill: %w", err)
	}
	defer rows.Close()

	var updated int64
	for rows.Next() {
		var fingerprint, pemStr string
		if err := rows.Scan(&fingerprint, &pemStr); err != nil {
			return updated, err
		}

		block, _ := pem.Decode([]byte(pemStr))
		if block == nil {
			slog.Warn("dn hash backfill: failed to decode PEM", "fingerprint", fingerprint)
			continue
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			slog.Warn("dn hash backfill: failed to parse certificate", "fingerprint", fingerprint, "error", err)
			continue
		}

		subjectHash := sha256.Sum256(cert.RawSubject)
		issuerHash := sha256.Sum256(cert.RawIssuer)

		_, err = s.db.ExecContext(ctx,
			`UPDATE tlsentinel.certificates SET subject_dn_hash = ?, issuer_dn_hash = ? WHERE fingerprint = ?`,
			hex.EncodeToString(subjectHash[:]),
			hex.EncodeToString(issuerHash[:]),
			fingerprint,
		)
		if err != nil {
			slog.Warn("dn hash backfill: failed to update", "fingerprint", fingerprint, "error", err)
			continue
		}
		updated++
	}
	return updated, rows.Err()
}

// BackfillSubjectOrgOU populates subject_org and subject_ou for certificates
// inserted before migration 000043. Parses the stored PEM for Subject O / OU.
//
// Not fully idempotent: rows whose certificates legitimately have neither O
// nor OU (CN-only leaf certs are common) remain '' and get re-scanned on
// every startup. Acceptable — the decode+skip is cheap, and certificate
// volumes here are small enough that the O(n) scan isn't worth tracking a
// visited sentinel.
func (s *Store) BackfillSubjectOrgOU(ctx context.Context) (int64, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT fingerprint, pem FROM tlsentinel.certificates
		 WHERE subject_org = '' AND subject_ou = '' AND pem <> ''`)
	if err != nil {
		return 0, fmt.Errorf("failed to query certificates for subject org/ou backfill: %w", err)
	}
	defer rows.Close()

	var updated int64
	for rows.Next() {
		var fingerprint, pemStr string
		if err := rows.Scan(&fingerprint, &pemStr); err != nil {
			return updated, err
		}

		block, _ := pem.Decode([]byte(pemStr))
		if block == nil {
			slog.Warn("subject org/ou backfill: failed to decode PEM", "fingerprint", fingerprint)
			continue
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			slog.Warn("subject org/ou backfill: failed to parse certificate", "fingerprint", fingerprint, "error", err)
			continue
		}

		org := ""
		if len(cert.Subject.Organization) > 0 {
			org = cert.Subject.Organization[0]
		}
		ou := ""
		if len(cert.Subject.OrganizationalUnit) > 0 {
			ou = cert.Subject.OrganizationalUnit[0]
		}
		if org == "" && ou == "" {
			continue
		}

		_, err = s.db.ExecContext(ctx,
			`UPDATE tlsentinel.certificates SET subject_org = ?, subject_ou = ? WHERE fingerprint = ?`,
			org, ou, fingerprint,
		)
		if err != nil {
			slog.Warn("subject org/ou backfill: failed to update", "fingerprint", fingerprint, "error", err)
			continue
		}
		updated++
	}
	return updated, rows.Err()
}

// CertReferences counts rows in each table that still reference a given
// certificate fingerprint. Used to explain why a manual delete was refused —
// see the project_cert_retention memory entry for why these FKs intentionally
// hard-block rather than CASCADE/SET NULL.
type CertReferences struct {
	ActiveEndpoints int // endpoints.active_fingerprint
	EndpointCerts   int // endpoint_certs.fingerprint (historical seen-list)
	ScanHistory     int // endpoint_scan_history.fingerprint
	IssuedCerts     int // certificates.issuer_fingerprint (self-ref)
}

// ErrCertHasReferences is returned by DeleteCertificate when the target cert
// is still referenced by at least one row in a table with an ON DELETE NO
// ACTION FK. The Refs field carries per-table counts so callers can build a
// helpful message.
type ErrCertHasReferences struct {
	Fingerprint string
	Refs        CertReferences
}

func (e *ErrCertHasReferences) Error() string {
	var parts []string
	if e.Refs.ActiveEndpoints > 0 {
		parts = append(parts, fmt.Sprintf("%d active %s", e.Refs.ActiveEndpoints, pluralize(e.Refs.ActiveEndpoints, "endpoint", "endpoints")))
	}
	if e.Refs.EndpointCerts > 0 {
		parts = append(parts, fmt.Sprintf("%d endpoint %s (historical)", e.Refs.EndpointCerts, pluralize(e.Refs.EndpointCerts, "attachment", "attachments")))
	}
	if e.Refs.ScanHistory > 0 {
		parts = append(parts, fmt.Sprintf("%d scan history %s", e.Refs.ScanHistory, pluralize(e.Refs.ScanHistory, "record", "records")))
	}
	if e.Refs.IssuedCerts > 0 {
		parts = append(parts, fmt.Sprintf("%d issued %s", e.Refs.IssuedCerts, pluralize(e.Refs.IssuedCerts, "certificate", "certificates")))
	}
	if len(parts) == 0 {
		// Shouldn't happen — we only construct this error when at least one
		// ref was found — but degrade gracefully rather than print "still
		// referenced by " with a trailing space.
		return "certificate is still referenced"
	}
	return "still referenced by " + strings.Join(parts, ", ")
}

func pluralize(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// DeleteCertificate removes a cert by fingerprint. If the cert is referenced
// by another row (endpoint_certs, endpoints.active_fingerprint,
// endpoint_scan_history.fingerprint, or certificates.issuer_fingerprint), the
// DB raises a foreign_key_violation (SQLSTATE 23503) and this method returns
// an *ErrCertHasReferences with per-table counts — callers surface that to
// users rather than a generic failure. See project_cert_retention for why
// these FKs are intentionally NO ACTION.
//
// Runtime errors come from bun's pgdriver (not lib/pq, which is only wired in
// for migrations), so we match on the pgdriver.Error value type and its
// Field('C') SQLSTATE.
func (s *Store) DeleteCertificate(ctx context.Context, fingerprint string) error {
	res, err := s.db.NewDelete().Model((*Certificate)(nil)).Where("fingerprint = ?", fingerprint).Exec(ctx)
	if err != nil {
		var pgErr pgdriver.Error
		if errors.As(err, &pgErr) && pgErr.Field('C') == "23503" {
			refs, refErr := s.countCertReferences(ctx, fingerprint)
			if refErr != nil {
				// Couldn't enumerate refs — still tell the caller it was an FK
				// block rather than a generic failure; just leave counts zero.
				slog.Warn("countCertReferences failed after FK violation",
					"fingerprint", fingerprint, "error", refErr)
			}
			return &ErrCertHasReferences{Fingerprint: fingerprint, Refs: refs}
		}
		return fmt.Errorf("failed to delete certificate: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// countCertReferences returns per-table reference counts for a fingerprint.
// One round-trip, four subqueries. Kept separate from DeleteCertificate so the
// fast path (no FK violation) doesn't pay for it.
func (s *Store) countCertReferences(ctx context.Context, fingerprint string) (CertReferences, error) {
	var refs CertReferences
	err := s.db.NewRaw(`
		SELECT
			(SELECT COUNT(*) FROM tlsentinel.endpoints             WHERE active_fingerprint  = ?),
			(SELECT COUNT(*) FROM tlsentinel.endpoint_certs        WHERE fingerprint         = ?),
			(SELECT COUNT(*) FROM tlsentinel.endpoint_scan_history WHERE fingerprint         = ?),
			(SELECT COUNT(*) FROM tlsentinel.certificates          WHERE issuer_fingerprint  = ?)
	`, fingerprint, fingerprint, fingerprint, fingerprint).
		Scan(ctx, &refs.ActiveEndpoints, &refs.EndpointCerts, &refs.ScanHistory, &refs.IssuedCerts)
	if err != nil {
		return CertReferences{}, fmt.Errorf("count cert references: %w", err)
	}
	return refs, nil
}
