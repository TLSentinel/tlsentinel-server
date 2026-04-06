package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/uptrace/bun"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// endpointWithScanner is used for queries that LEFT JOIN scanners, endpoint_hosts, and endpoint_saml.
type endpointWithScanner struct {
	Endpoint
	ScannerName    *string    `bun:"scanner_name"`
	// Host-type fields joined from endpoint_hosts.
	DNSName        string     `bun:"dns_name"`
	IPAddress      *string    `bun:"ip_address"`
	Port           int        `bun:"port"`
	// SAML-type fields joined from endpoint_saml.
	URL            *string    `bun:"url"`
	// EarliestExpiry is the minimum not_after across all current endpoint_certs rows.
	EarliestExpiry *time.Time `bun:"earliest_expiry"`
}

// endpointCertRow is used to hydrate active cert details for a single endpoint.
type endpointCertRow struct {
	Fingerprint string    `bun:"fingerprint"`
	CertUse     string    `bun:"cert_use"`
	IsCurrent   bool      `bun:"is_current"`
	CommonName  string    `bun:"common_name"`
	NotBefore   time.Time `bun:"not_before"`
	NotAfter    time.Time `bun:"not_after"`
	FirstSeenAt time.Time `bun:"first_seen_at"`
	LastSeenAt  time.Time `bun:"last_seen_at"`
}

func endpointRowToListItem(r endpointWithScanner) models.EndpointListItem {
	return models.EndpointListItem{
		ID:             r.ID,
		Name:           r.Name,
		Type:           r.Type,
		DNSName:        r.DNSName,
		Port:           r.Port,
		URL:            r.URL,
		Enabled:        r.Enabled,
		ScannerID:      r.ScannerID,
		ScannerName:    r.ScannerName,
		EarliestExpiry: r.EarliestExpiry,
		LastScannedAt:  r.LastScannedAt,
		LastScanError:  r.LastScanError,
		ErrorSince:     r.ErrorSince,
	}
}

func endpointRowToEndpoint(r endpointWithScanner) models.Endpoint {
	return models.Endpoint{
		ID:            r.ID,
		Name:          r.Name,
		Type:          r.Type,
		DNSName:       r.DNSName,
		IPAddress:     r.IPAddress,
		Port:          r.Port,
		URL:           r.URL,
		Enabled:       r.Enabled,
		ScannerID:     r.ScannerID,
		ScannerName:   r.ScannerName,
		ActiveCerts:   []models.EndpointCert{}, // populated separately by GetEndpoint
		LastScannedAt: r.LastScannedAt,
		LastScanError: r.LastScanError,
		ErrorSince:    r.ErrorSince,
		Notes:         r.Notes,
		CreatedAt:     r.CreatedAt,
		UpdatedAt:     r.UpdatedAt,
	}
}

// selectEndpointWithScanner returns a base query joining endpoints, scanners,
// endpoint_hosts, and endpoint_saml. All type-specific joins are LEFT JOINs so
// they return NULL for non-matching types rather than dropping rows.
// EarliestExpiry is derived via a lateral subquery over endpoint_certs.
func (s *Store) selectEndpointWithScanner() *bun.SelectQuery {
	return s.db.NewSelect().
		TableExpr("tlsentinel.endpoints AS h").
		ColumnExpr("h.*").
		ColumnExpr("at.name AS scanner_name").
		ColumnExpr("eh.dns_name, eh.ip_address, eh.port").
		ColumnExpr("es.url").
		ColumnExpr("exp.earliest_expiry").
		Join("LEFT JOIN tlsentinel.scanners AS at ON h.scanner_id = at.id").
		Join("LEFT JOIN tlsentinel.endpoint_hosts AS eh ON eh.endpoint_id = h.id").
		Join("LEFT JOIN tlsentinel.endpoint_saml AS es ON es.endpoint_id = h.id").
		Join(`LEFT JOIN LATERAL (
			SELECT MIN(c.not_after) AS earliest_expiry
			FROM tlsentinel.endpoint_certs ec
			JOIN tlsentinel.certificates c ON c.fingerprint = ec.fingerprint
			WHERE ec.endpoint_id = h.id AND ec.is_current = TRUE
		) exp ON TRUE`)
}

// ListEndpoints returns a paginated list of endpoints.
//
// hasError: when true, only endpoints with a non-nil last_scan_error are returned.
// search: case-insensitive contains match on name or dns_name.
// status: "" = all, "enabled" = enabled only, "disabled" = disabled only.
// sort: "" or "newest" (default), "name", "dns_name", "last_scanned".
func (s *Store) ListEndpoints(ctx context.Context, page, pageSize int, hasError bool, search, status, sort, tagID string) (models.EndpointList, error) {
	var rows []endpointWithScanner

	var orderExpr string
	switch sort {
	case "name":
		orderExpr = "h.name ASC"
	case "dns_name":
		orderExpr = "eh.dns_name ASC"
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
		q = q.Where("(h.name ILIKE ? OR eh.dns_name ILIKE ?)", pattern, pattern)
	}
	switch status {
	case "enabled":
		q = q.Where("h.enabled = TRUE")
	case "disabled":
		q = q.Where("h.enabled = FALSE")
	}
	if tagID != "" {
		q = q.Where("EXISTS (SELECT 1 FROM tlsentinel.endpoint_tags et WHERE et.endpoint_id = h.id AND et.tag_id = ?)", tagID)
	}
	total, err := q.ScanAndCount(ctx, &rows)
	if err != nil {
		return models.EndpointList{}, fmt.Errorf("failed to list endpoints: %w", err)
	}

	items := make([]models.EndpointListItem, len(rows))
	for i, r := range rows {
		items[i] = endpointRowToListItem(r)
		items[i].Tags = []models.TagWithCategory{}
	}

	// Batch-fetch tags for all endpoints on this page.
	if len(items) > 0 {
		endpointIDs := make([]string, len(items))
		for i, item := range items {
			endpointIDs[i] = item.ID
		}
		type tagRow struct {
			EndpointID   string `bun:"endpoint_id"`
			TagID        string `bun:"tag_id"`
			TagName      string `bun:"tag_name"`
			CategoryID   string `bun:"category_id"`
			CategoryName string `bun:"category_name"`
		}
		var tagRows []tagRow
		err := s.db.NewSelect().
			TableExpr("tlsentinel.endpoint_tags et").
			ColumnExpr("et.endpoint_id, et.tag_id, t.name AS tag_name, t.category_id, tc.name AS category_name").
			Join("JOIN tlsentinel.tags t ON t.id = et.tag_id").
			Join("JOIN tlsentinel.tag_categories tc ON tc.id = t.category_id").
			Where("et.endpoint_id IN (?)", bun.In(endpointIDs)).
			OrderExpr("tc.name ASC, t.name ASC").
			Scan(ctx, &tagRows)
		if err == nil {
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
				if tags, ok := tagsByEndpoint[items[i].ID]; ok {
					items[i].Tags = tags
				}
			}
		}
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
	ep := endpointRowToEndpoint(row)

	// Fetch all current certs for this endpoint, enriched with cert metadata.
	var certRows []endpointCertRow
	err = s.db.NewSelect().
		TableExpr("tlsentinel.endpoint_certs ec").
		ColumnExpr("ec.fingerprint, ec.cert_use, ec.is_current, ec.first_seen_at, ec.last_seen_at").
		ColumnExpr("c.common_name, c.not_before, c.not_after").
		Join("JOIN tlsentinel.certificates c ON c.fingerprint = ec.fingerprint").
		Where("ec.endpoint_id = ? AND ec.is_current = TRUE", id).
		OrderExpr("ec.cert_use ASC").
		Scan(ctx, &certRows)
	if err != nil {
		return models.Endpoint{}, fmt.Errorf("failed to get endpoint certs: %w", err)
	}
	certs := make([]models.EndpointCert, len(certRows))
	for i, cr := range certRows {
		certs[i] = models.EndpointCert{
			Fingerprint: cr.Fingerprint,
			CertUse:     cr.CertUse,
			IsCurrent:   cr.IsCurrent,
			CommonName:  cr.CommonName,
			NotBefore:   cr.NotBefore,
			NotAfter:    cr.NotAfter,
			FirstSeenAt: cr.FirstSeenAt,
			LastSeenAt:  cr.LastSeenAt,
		}
	}
	ep.ActiveCerts = certs
	return ep, nil
}

func (s *Store) InsertEndpoint(ctx context.Context, rec models.EndpointRecord) (models.Endpoint, error) {
	h := &Endpoint{
		Name:      rec.Name,
		Type:      rec.Type,
		Enabled:   rec.Enabled,
		ScannerID: rec.ScannerID,
		Notes:     rec.Notes,
	}

	err := s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewInsert().Model(h).
			ExcludeColumn("id", "created_at", "updated_at").
			Returning("*").
			Exec(ctx); err != nil {
			return fmt.Errorf("failed to insert endpoint: %w", err)
		}

		switch rec.Type {
		case "host", "":
			eh := &EndpointHost{
				EndpointID: h.ID,
				DNSName:    rec.DNSName,
				IPAddress:  rec.IPAddress,
				Port:       rec.Port,
			}
			if _, err := tx.NewInsert().Model(eh).Exec(ctx); err != nil {
				return fmt.Errorf("failed to insert endpoint_hosts: %w", err)
			}
		case "saml":
			es := &EndpointSAML{
				EndpointID: h.ID,
				URL:        *rec.URL,
			}
			if _, err := tx.NewInsert().Model(es).Exec(ctx); err != nil {
				return fmt.Errorf("failed to insert endpoint_saml: %w", err)
			}
		}

		return nil
	})
	if err != nil {
		return models.Endpoint{}, err
	}

	return s.GetEndpoint(ctx, h.ID)
}

func (s *Store) UpdateEndpoint(ctx context.Context, id string, rec models.EndpointRecord) (models.Endpoint, error) {
	err := s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		res, err := tx.NewUpdate().
			TableExpr("tlsentinel.endpoints").
			Set("name = ?", rec.Name).
			Set("type = ?", rec.Type).
			Set("enabled = ?", rec.Enabled).
			Set("scanner_id = ?", rec.ScannerID).
			Set("notes = ?", rec.Notes).
			Set("updated_at = NOW()").
			Where("id = ?", id).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("failed to update endpoint: %w", err)
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return ErrNotFound
		}

		// Clear all type-specific rows first so a type change never leaves orphans.
		if _, err = tx.NewDelete().TableExpr("tlsentinel.endpoint_hosts").
			Where("endpoint_id = ?", id).Exec(ctx); err != nil {
			return fmt.Errorf("failed to clear endpoint_hosts: %w", err)
		}
		if _, err = tx.NewDelete().TableExpr("tlsentinel.endpoint_saml").
			Where("endpoint_id = ?", id).Exec(ctx); err != nil {
			return fmt.Errorf("failed to clear endpoint_saml: %w", err)
		}

		switch rec.Type {
		case "host", "":
			eh := &EndpointHost{
				EndpointID: id,
				DNSName:    rec.DNSName,
				IPAddress:  rec.IPAddress,
				Port:       rec.Port,
			}
			if _, err = tx.NewInsert().Model(eh).Exec(ctx); err != nil {
				return fmt.Errorf("failed to insert endpoint_hosts: %w", err)
			}
		case "saml":
			es := &EndpointSAML{
				EndpointID: id,
				URL:        *rec.URL,
			}
			if _, err = tx.NewInsert().Model(es).Exec(ctx); err != nil {
				return fmt.Errorf("failed to insert endpoint_saml: %w", err)
			}
			// manual: no type-specific row needed
		}

		return nil
	})
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return models.Endpoint{}, ErrNotFound
		}
		return models.Endpoint{}, err
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

// GetScannerHosts returns enabled host-type endpoints assigned to a scanner.
// If the scanner is the default it also claims endpoints with no explicit scanner_id.
func (s *Store) GetScannerHostEndpoints(ctx context.Context, scannerID string) ([]models.ScannerHost, error) {
	type hostRow struct {
		ID        string  `bun:"id"`
		DNSName   string  `bun:"dns_name"`
		IPAddress *string `bun:"ip_address"`
		Port      int     `bun:"port"`
	}

	var rows []hostRow
	err := s.db.NewSelect().
		TableExpr("tlsentinel.endpoints AS h").
		ColumnExpr("h.id, eh.dns_name, eh.ip_address, eh.port").
		Join("JOIN tlsentinel.endpoint_hosts AS eh ON eh.endpoint_id = h.id").
		Where(`h.enabled = TRUE AND h.type = 'host' AND (
			h.scanner_id = ?::uuid
			OR (h.scanner_id IS NULL AND EXISTS (
				SELECT 1 FROM tlsentinel.scanners
				WHERE id = ?::uuid AND is_default = TRUE
			))
		)`, scannerID, scannerID).
		OrderExpr("eh.dns_name").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("failed to query scanner hosts: %w", err)
	}

	result := make([]models.ScannerHost, len(rows))
	for i, r := range rows {
		result[i] = models.ScannerHost{
			ID:        r.ID,
			DNSName:   r.DNSName,
			IPAddress: r.IPAddress,
			Port:      r.Port,
		}
	}
	return result, nil
}

// GetScannerSAMLEndpoints returns enabled SAML-type endpoints assigned to a scanner.
// If the scanner is the default it also claims endpoints with no explicit scanner_id.
func (s *Store) GetScannerSAMLEndpoints(ctx context.Context, scannerID string) ([]models.ScannerSAMLEndpoint, error) {
	type samlRow struct {
		ID  string `bun:"id"`
		URL string `bun:"url"`
	}

	var rows []samlRow
	err := s.db.NewSelect().
		TableExpr("tlsentinel.endpoints AS e").
		ColumnExpr("e.id, es.url").
		Join("JOIN tlsentinel.endpoint_saml AS es ON es.endpoint_id = e.id").
		Where(`e.enabled = TRUE AND e.type = 'saml' AND (
			e.scanner_id = ?::uuid
			OR (e.scanner_id IS NULL AND EXISTS (
				SELECT 1 FROM tlsentinel.scanners
				WHERE id = ?::uuid AND is_default = TRUE
			))
		)`, scannerID, scannerID).
		OrderExpr("es.url").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("failed to query scanner SAML endpoints: %w", err)
	}

	result := make([]models.ScannerSAMLEndpoint, len(rows))
	for i, r := range rows {
		result[i] = models.ScannerSAMLEndpoint{ID: r.ID, URL: r.URL}
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
			ID:          r.ID,
			EndpointID:  r.EndpointID,
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
			TableExpr("tlsentinel.endpoints").
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
			EndpointID:  hostID,
			Fingerprint: req.ActiveFingerprint,
			ResolvedIP:  req.ResolvedIP,
			TLSVersion:  req.TLSVersion,
			ScanError:   req.Error,
		}).ExcludeColumn("id", "scanned_at").Exec(ctx)
		if err != nil {
			return fmt.Errorf("failed to insert scan history: %w", err)
		}

		// Only update endpoint_certs when there is a leaf cert (non-error scan).
		if req.ActiveFingerprint != nil {
			if err := upsertEndpointCert(ctx, tx, hostID, *req.ActiveFingerprint, "tls"); err != nil {
				return err
			}
		}

		return nil
	})
}

// UpsertEndpointCert links a certificate to an endpoint with the given use label.
// Any previously current cert for the same (endpoint, use) pair is rolled over
// to is_current = FALSE when the fingerprint differs.
// This is the store method used by the manual cert upload handler.
func (s *Store) UpsertEndpointCert(ctx context.Context, endpointID, fingerprint, certUse string) error {
	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		return upsertEndpointCert(ctx, tx, endpointID, fingerprint, certUse)
	})
}

// upsertEndpointCert is the shared inner implementation used inside transactions.
func upsertEndpointCert(ctx context.Context, tx bun.Tx, endpointID, fingerprint, certUse string) error {
	// Roll over any current cert for this endpoint+use that has a different fingerprint.
	_, err := tx.NewUpdate().
		TableExpr("tlsentinel.endpoint_certs").
		Set("is_current = FALSE, last_seen_at = NOW()").
		Where("endpoint_id = ?", endpointID).
		Where("cert_use = ?", certUse).
		Where("is_current = TRUE").
		Where("fingerprint != ?", fingerprint).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to roll over previous endpoint cert: %w", err)
	}

	// Upsert the new/continuing cert as current.
	// Use the model so bun can build the ON CONFLICT SET clause correctly.
	// ExcludeColumn("id") lets Postgres apply the DEFAULT gen_random_uuid().
	now := time.Now()
	ec := &EndpointCert{
		EndpointID:  endpointID,
		Fingerprint: fingerprint,
		CertUse:     certUse,
		IsCurrent:   true,
		FirstSeenAt: now,
		LastSeenAt:  now,
	}
	_, err = tx.NewInsert().
		Model(ec).
		ExcludeColumn("id").
		On("CONFLICT (endpoint_id, fingerprint, cert_use) DO UPDATE").
		Set("is_current = TRUE, last_seen_at = NOW()").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to upsert endpoint cert: %w", err)
	}
	return nil
}
