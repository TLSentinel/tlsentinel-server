package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/uptrace/bun"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// hostWithScanner is used for queries that LEFT JOIN scanners to fetch the scanner name.
type hostWithScanner struct {
	Host
	ScannerName *string `bun:"scanner_name"`
}

func hostRowToListItem(r hostWithScanner) models.HostListItem {
	return models.HostListItem{
		ID:                r.ID,
		Name:              r.Name,
		DNSName:           r.DNSName,
		Port:              r.Port,
		Enabled:           r.Enabled,
		ScannerID:         r.ScannerID,
		ScannerName:       r.ScannerName,
		ActiveFingerprint: r.ActiveFingerprint,
		LastScannedAt:     r.LastScannedAt,
		LastScanError:     r.LastScanError,
		ErrorSince:        r.ErrorSince,
	}
}

func hostRowToHost(r hostWithScanner) models.Host {
	return models.Host{
		ID:                r.ID,
		Name:              r.Name,
		DNSName:           r.DNSName,
		IPAddress:         r.IPAddress,
		Port:              r.Port,
		Enabled:           r.Enabled,
		ScannerID:         r.ScannerID,
		ScannerName:       r.ScannerName,
		ActiveFingerprint: r.ActiveFingerprint,
		LastScannedAt:     r.LastScannedAt,
		LastScanError:     r.LastScanError,
		ErrorSince:        r.ErrorSince,
		CreatedAt:         r.CreatedAt,
		UpdatedAt:         r.UpdatedAt,
	}
}

// selectHostWithScanner returns a base query that joins hosts with scanners.
func (s *Store) selectHostWithScanner() *bun.SelectQuery {
	return s.db.NewSelect().
		TableExpr("tlsentinel.hosts AS h").
		ColumnExpr("h.*").
		ColumnExpr("at.name AS scanner_name").
		Join("LEFT JOIN tlsentinel.scanners AS at ON h.scanner_id = at.id")
}

// ListHosts returns a paginated list of hosts.
//
// hasError: when true, only hosts with a non-nil last_scan_error are returned.
// search: case-insensitive contains match on name or dns_name.
// status: "" = all, "enabled" = enabled only, "disabled" = disabled only.
// sort: "" or "newest" (default), "name", "dns_name", "last_scanned".
func (s *Store) ListHosts(ctx context.Context, page, pageSize int, hasError bool, search, status, sort string) (models.HostList, error) {
	var rows []hostWithScanner

	var orderExpr string
	switch sort {
	case "name":
		orderExpr = "h.name ASC"
	case "dns_name":
		orderExpr = "h.dns_name ASC"
	case "last_scanned":
		orderExpr = "h.last_scanned_at DESC NULLS LAST"
	default:
		orderExpr = "h.created_at DESC"
	}

	q := s.selectHostWithScanner().
		OrderExpr(orderExpr).
		Limit(pageSize).
		Offset((page - 1) * pageSize)
	if hasError {
		q = q.Where("h.last_scan_error IS NOT NULL")
	}
	if search != "" {
		pattern := "%" + search + "%"
		q = q.Where("(h.name ILIKE ? OR h.dns_name ILIKE ?)", pattern, pattern)
	}
	switch status {
	case "enabled":
		q = q.Where("h.enabled = TRUE")
	case "disabled":
		q = q.Where("h.enabled = FALSE")
	}
	total, err := q.ScanAndCount(ctx, &rows)
	if err != nil {
		return models.HostList{}, fmt.Errorf("failed to list hosts: %w", err)
	}

	items := make([]models.HostListItem, len(rows))
	for i, r := range rows {
		items[i] = hostRowToListItem(r)
	}
	return models.HostList{
		Items:      items,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
	}, nil
}

func (s *Store) GetHost(ctx context.Context, id string) (models.Host, error) {
	var row hostWithScanner
	err := s.selectHostWithScanner().
		Where("h.id = ?", id).
		Scan(ctx, &row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.Host{}, ErrNotFound
		}
		return models.Host{}, fmt.Errorf("failed to get host: %w", err)
	}
	return hostRowToHost(row), nil
}

func (s *Store) InsertHost(ctx context.Context, rec models.HostRecord) (models.Host, error) {
	h := &Host{
		Name:      rec.Name,
		DNSName:   rec.DNSName,
		IPAddress: rec.IPAddress,
		Port:      rec.Port,
		Enabled:   rec.Enabled,
		ScannerID: rec.ScannerID,
	}
	if _, err := s.db.NewInsert().Model(h).
		ExcludeColumn("id", "created_at", "updated_at").
		Returning("*").
		Exec(ctx); err != nil {
		return models.Host{}, fmt.Errorf("failed to insert host: %w", err)
	}
	return s.GetHost(ctx, h.ID)
}

func (s *Store) UpdateHost(ctx context.Context, id string, rec models.HostRecord) (models.Host, error) {
	res, err := s.db.NewUpdate().
		TableExpr("tlsentinel.hosts").
		Set("name = ?", rec.Name).
		Set("dns_name = ?", rec.DNSName).
		Set("ip_address = ?", rec.IPAddress).
		Set("port = ?", rec.Port).
		Set("enabled = ?", rec.Enabled).
		Set("scanner_id = ?", rec.ScannerID).
		Set("updated_at = NOW()").
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return models.Host{}, fmt.Errorf("failed to update host: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return models.Host{}, ErrNotFound
	}
	return s.GetHost(ctx, id)
}

func (s *Store) DeleteHost(ctx context.Context, id string) error {
	res, err := s.db.NewDelete().Model((*Host)(nil)).Where("id = ?", id).Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete host: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// GetScannerHosts: if the scanner is the default it also claims hosts with no explicit scanner_id.
func (s *Store) GetScannerHosts(ctx context.Context, scannerID string) ([]models.ScannerHost, error) {
	var hosts []Host
	err := s.db.NewSelect().
		Model(&hosts).
		Where(`h.enabled = TRUE AND (
			h.scanner_id = ?::uuid
			OR (h.scanner_id IS NULL AND EXISTS (
				SELECT 1 FROM tlsentinel.scanners
				WHERE id = ?::uuid AND is_default = TRUE
			))
		)`, scannerID, scannerID).
		OrderExpr("dns_name").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to query scanner hosts: %w", err)
	}

	result := make([]models.ScannerHost, len(hosts))
	for i, h := range hosts {
		result[i] = models.ScannerHost{
			ID:        h.ID,
			DNSName:   h.DNSName,
			IPAddress: h.IPAddress,
			Port:      h.Port,
		}
	}
	return result, nil
}

func (s *Store) GetHostScanHistory(ctx context.Context, hostID string, limit int) ([]models.HostScanHistory, error) {
	var rows []HostScanHistory
	err := s.db.NewSelect().
		Model(&rows).
		Where("host_id = ?", hostID).
		OrderExpr("scanned_at DESC").
		Limit(limit).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to query scan history: %w", err)
	}

	items := make([]models.HostScanHistory, len(rows))
	for i, r := range rows {
		items[i] = models.HostScanHistory{
			ID:          r.ID,
			HostID:      r.HostID,
			ScannedAt:   r.ScannedAt,
			Fingerprint: r.Fingerprint,
			ResolvedIP:  r.ResolvedIP,
			TLSVersion:  r.TLSVersion,
			ScanError:   r.ScanError,
		}
	}
	return items, nil
}

func (s *Store) RecordScanResult(ctx context.Context, hostID string, req models.ScanResultRequest) error {
	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		_, err := tx.NewUpdate().
			TableExpr("tlsentinel.hosts").
			Set("active_fingerprint = ?", req.ActiveFingerprint).
			Set("last_scanned_at = NOW()").
			Set("last_scan_error = ?", req.Error).
			Set(`error_since = CASE
				WHEN ?::TEXT IS NOT NULL AND last_scan_error IS NULL THEN NOW()
				WHEN ?::TEXT IS NULL THEN NULL
				ELSE error_since END`, req.Error, req.Error).
			Set("updated_at = NOW()").
			Where("id = ?", hostID).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("failed to update host scan state: %w", err)
		}

		_, err = tx.NewInsert().Model(&HostScanHistory{
			HostID:      hostID,
			Fingerprint: req.ActiveFingerprint,
			ResolvedIP:  req.ResolvedIP,
			TLSVersion:  req.TLSVersion,
			ScanError:   req.Error,
		}).ExcludeColumn("id").Exec(ctx)
		if err != nil {
			return fmt.Errorf("failed to insert scan history: %w", err)
		}

		return nil
	})
}
