package db

import (
	"context"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// UniversalSearch runs three bounded ILIKE queries — endpoints, certificates,
// scanners — and returns up to `limit` matches from each. Intended for the
// header command-search dropdown; not a pagination surface.
func (s *Store) UniversalSearch(ctx context.Context, q string, limit int) (models.SearchResults, error) {
	pattern := "%" + q + "%"
	prefix := q + "%"

	var endpointRows []struct {
		ID      string  `bun:"id"`
		Name    string  `bun:"name"`
		Type    string  `bun:"type"`
		DNSName *string `bun:"dns_name"`
		URL     *string `bun:"url"`
	}
	err := s.db.NewSelect().
		TableExpr("tlsentinel.endpoints AS h").
		ColumnExpr("h.id, h.name, h.type, eh.dns_name AS dns_name, es.url AS url").
		Join("LEFT JOIN tlsentinel.endpoint_hosts AS eh ON eh.endpoint_id = h.id").
		Join("LEFT JOIN tlsentinel.endpoint_saml AS es ON es.endpoint_id = h.id").
		Where("h.name ILIKE ? OR eh.dns_name ILIKE ? OR es.url ILIKE ?", pattern, pattern, pattern).
		OrderExpr("h.name ASC").
		Limit(limit).
		Scan(ctx, &endpointRows)
	if err != nil {
		return models.SearchResults{}, fmt.Errorf("search endpoints: %w", err)
	}
	endpoints := make([]models.SearchEndpoint, len(endpointRows))
	for i, r := range endpointRows {
		var subtitle string
		switch {
		case r.DNSName != nil:
			subtitle = *r.DNSName
		case r.URL != nil:
			subtitle = *r.URL
		}
		endpoints[i] = models.SearchEndpoint{
			ID:       r.ID,
			Name:     r.Name,
			Type:     r.Type,
			Subtitle: subtitle,
		}
	}

	var certificates []models.SearchCertificate
	err = s.db.NewSelect().
		Model((*Certificate)(nil)).
		ColumnExpr("fingerprint, common_name, not_after").
		// Fingerprint uses prefix match (it's a long hex string; contains-match
		// would produce useless substring hits).
		Where("common_name ILIKE ? OR fingerprint ILIKE ? OR EXISTS (SELECT 1 FROM unnest(sans) s WHERE s ILIKE ?)", pattern, prefix, pattern).
		OrderExpr("common_name ASC").
		Limit(limit).
		Scan(ctx, &certificates)
	if err != nil {
		return models.SearchResults{}, fmt.Errorf("search certificates: %w", err)
	}

	var scanners []models.SearchScanner
	err = s.db.NewSelect().
		Model((*Scanner)(nil)).
		ColumnExpr("id, name").
		Where("name ILIKE ?", pattern).
		OrderExpr("name ASC").
		Limit(limit).
		Scan(ctx, &scanners)
	if err != nil {
		return models.SearchResults{}, fmt.Errorf("search scanners: %w", err)
	}

	// Force empty slices rather than nil so the JSON contract is always an
	// array — the frontend maps over these unconditionally.
	if certificates == nil {
		certificates = []models.SearchCertificate{}
	}
	if scanners == nil {
		scanners = []models.SearchScanner{}
	}
	return models.SearchResults{
		Endpoints:    endpoints,
		Certificates: certificates,
		Scanners:     scanners,
	}, nil
}
