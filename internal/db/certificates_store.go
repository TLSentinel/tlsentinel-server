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
	"time"

	"go.uber.org/zap"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// ListAllActiveCerts returns a paginated list of active host-certificate pairs.
//
// search filters on host_name, dns_name, or common_name (case-insensitive contains).
// status restricts results by expiry bucket: "expired" (<0), "critical" (0–7), "warning" (8–30), "ok" (>30).
// sort controls ordering: "" or "days_asc" (default), "days_desc", "host_name", "common_name".
// An empty status returns all entries.
func (s *Store) ListAllActiveCerts(ctx context.Context, page, pageSize int, search, status, sort string) (models.ExpiringCertList, error) {
	var rows []VActiveCertificate

	var orderExpr string
	switch sort {
	case "days_desc":
		orderExpr = "days_remaining DESC"
	case "host_name":
		orderExpr = "host_name ASC"
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
		q = q.Where("(host_name ILIKE ? OR dns_name ILIKE ? OR common_name ILIKE ?)", pattern, pattern, pattern)
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

	total, err := q.ScanAndCount(ctx)
	if err != nil {
		return models.ExpiringCertList{}, fmt.Errorf("failed to list active certs: %w", err)
	}

	items := make([]models.ExpiringCertItem, len(rows))
	for i, r := range rows {
		items[i] = models.ExpiringCertItem{
			HostID:        r.HostID,
			HostName:      r.HostName,
			DNSName:       r.DNSName,
			Port:          r.Port,
			Fingerprint:   r.Fingerprint,
			CommonName:    r.CommonName,
			NotAfter:      r.NotAfter,
			DaysRemaining: r.DaysRemaining,
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
		items[i] = models.ExpiringCertItem{
			HostID:        r.HostID,
			HostName:      r.HostName,
			DNSName:       r.DNSName,
			Port:          r.Port,
			Fingerprint:   r.Fingerprint,
			CommonName:    r.CommonName,
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
	}, nil
}

func (s *Store) GetCertificateHosts(ctx context.Context, fingerprint string) ([]models.HostListItem, error) {
	var rows []hostWithScanner
	err := s.db.NewSelect().
		TableExpr("tlsentinel.hosts AS h").
		ColumnExpr("h.*").
		ColumnExpr("at.name AS scanner_name").
		Join("LEFT JOIN tlsentinel.scanners AS at ON h.scanner_id = at.id").
		Where("h.active_fingerprint = ?", fingerprint).
		OrderExpr("h.dns_name").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("failed to query certificate hosts: %w", err)
	}

	hosts := make([]models.HostListItem, len(rows))
	for i, r := range rows {
		hosts[i] = hostRowToListItem(r)
	}
	return hosts, nil
}

func (s *Store) InsertCertificate(ctx context.Context, rec models.CertificateRecord) (inserted bool, err error) {
	c := &Certificate{
		Fingerprint:    rec.Fingerprint,
		PEM:            rec.PEM,
		CommonName:     rec.CommonName,
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
			zap.L().Warn("dn hash backfill: failed to decode PEM", zap.String("fingerprint", fingerprint))
			continue
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			zap.L().Warn("dn hash backfill: failed to parse certificate", zap.String("fingerprint", fingerprint), zap.Error(err))
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
			zap.L().Warn("dn hash backfill: failed to update", zap.String("fingerprint", fingerprint), zap.Error(err))
			continue
		}
		updated++
	}
	return updated, rows.Err()
}

func (s *Store) DeleteCertificate(ctx context.Context, fingerprint string) error {
	res, err := s.db.NewDelete().Model((*Certificate)(nil)).Where("fingerprint = ?", fingerprint).Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete certificate: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
