package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/uptrace/bun"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// endpointWithScanner is used for queries that LEFT JOIN scanners to fetch the scanner name.
type endpointWithScanner struct {
	Endpoint
	ScannerName *string `bun:"scanner_name"`
}

func endpointRowToListItem(r endpointWithScanner) models.EndpointListItem {
	return models.EndpointListItem{
		ID:                r.ID,
		Name:              r.Name,
		Type:              r.Type,
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

func endpointRowToEndpoint(r endpointWithScanner) models.Endpoint {
	return models.Endpoint{
		ID:                r.ID,
		Name:              r.Name,
		Type:              r.Type,
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
		Notes:             r.Notes,
		CreatedAt:         r.CreatedAt,
		UpdatedAt:         r.UpdatedAt,
	}
}

// selectEndpointWithScanner returns a base query that joins endpoints with scanners.
func (s *Store) selectEndpointWithScanner() *bun.SelectQuery {
	return s.db.NewSelect().
		TableExpr("tlsentinel.endpoints AS h").
		ColumnExpr("h.*").
		ColumnExpr("at.name AS scanner_name").
		Join("LEFT JOIN tlsentinel.scanners AS at ON h.scanner_id = at.id")
}

// ListEndpoints returns a paginated list of endpoints.
//
// hasError: when true, only endpoints with a non-nil last_scan_error are returned.
// search: case-insensitive contains match on name or dns_name.
// status: "" = all, "enabled" = enabled only, "disabled" = disabled only.
// sort: "" or "newest" (default), "name", "dns_name", "last_scanned".
func (s *Store) ListEndpoints(ctx context.Context, page, pageSize int, hasError bool, search, status, sort string) (models.EndpointList, error) {
	var rows []endpointWithScanner

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

	q := s.selectEndpointWithScanner().
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
		return models.EndpointList{}, fmt.Errorf("failed to list endpoints: %w", err)
	}

	items := make([]models.EndpointListItem, len(rows))
	for i, r := range rows {
		items[i] = endpointRowToListItem(r)
	}
	return models.EndpointList{
		Items:      items,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
	}, nil
}

func (s *Store) GetEndpoint(ctx context.Context, id string) (models.Endpoint, error) {
	var row endpointWithScanner
	err := s.selectEndpointWithScanner().
		Where("h.id = ?", id).
		Scan(ctx, &row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.Endpoint{}, ErrNotFound
		}
		return models.Endpoint{}, fmt.Errorf("failed to get endpoint: %w", err)
	}
	return endpointRowToEndpoint(row), nil
}

func (s *Store) InsertEndpoint(ctx context.Context, rec models.EndpointRecord) (models.Endpoint, error) {
	h := &Endpoint{
		Name:      rec.Name,
		Type:      rec.Type,
		DNSName:   rec.DNSName,
		IPAddress: rec.IPAddress,
		Port:      rec.Port,
		Enabled:   rec.Enabled,
		ScannerID: rec.ScannerID,
		Notes:     rec.Notes,
	}
	if _, err := s.db.NewInsert().Model(h).
		ExcludeColumn("id", "created_at", "updated_at").
		Returning("*").
		Exec(ctx); err != nil {
		return models.Endpoint{}, fmt.Errorf("failed to insert endpoint: %w", err)
	}
	return s.GetEndpoint(ctx, h.ID)
}

func (s *Store) UpdateEndpoint(ctx context.Context, id string, rec models.EndpointRecord) (models.Endpoint, error) {
	res, err := s.db.NewUpdate().
		TableExpr("tlsentinel.endpoints").
		Set("name = ?", rec.Name).
		Set("type = ?", rec.Type).
		Set("dns_name = ?", rec.DNSName).
		Set("ip_address = ?", rec.IPAddress).
		Set("port = ?", rec.Port).
		Set("enabled = ?", rec.Enabled).
		Set("scanner_id = ?", rec.ScannerID).
		Set("notes = ?", rec.Notes).
		Set("updated_at = NOW()").
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return models.Endpoint{}, fmt.Errorf("failed to update endpoint: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return models.Endpoint{}, ErrNotFound
	}
	return s.GetEndpoint(ctx, id)
}

func (s *Store) DeleteEndpoint(ctx context.Context, id string) error {
	res, err := s.db.NewDelete().Model((*Endpoint)(nil)).Where("id = ?", id).Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete endpoint: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// GetScannerHosts: if the scanner is the default it also claims endpoints with no explicit scanner_id.
func (s *Store) GetScannerHosts(ctx context.Context, scannerID string) ([]models.ScannerHost, error) {
	var hosts []Endpoint
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

func (s *Store) GetEndpointScanHistory(ctx context.Context, hostID string, limit int) ([]models.EndpointScanHistory, error) {
	var rows []EndpointScanHistory
	err := s.db.NewSelect().
		Model(&rows).
		Where("endpoint_id = ?", hostID).
		OrderExpr("scanned_at DESC").
		Limit(limit).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to query scan history: %w", err)
	}

	items := make([]models.EndpointScanHistory, len(rows))
	for i, r := range rows {
		items[i] = models.EndpointScanHistory{
			ID:         r.ID,
			EndpointID: r.EndpointID,
			ScannedAt:  r.ScannedAt,
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
			TableExpr("tlsentinel.endpoints").
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
			return fmt.Errorf("failed to update endpoint scan state: %w", err)
		}

		_, err = tx.NewInsert().Model(&EndpointScanHistory{
			EndpointID: hostID,
			Fingerprint: req.ActiveFingerprint,
			ResolvedIP:  req.ResolvedIP,
			TLSVersion:  req.TLSVersion,
			ScanError:   req.Error,
		}).ExcludeColumn("id", "scanned_at").Exec(ctx)
		if err != nil {
			return fmt.Errorf("failed to insert scan history: %w", err)
		}

		return nil
	})
}
