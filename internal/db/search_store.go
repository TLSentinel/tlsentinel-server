package db

import (
	"context"
	"fmt"
	"strings"

	"github.com/tlsentinel/tlsentinel-server/internal/iputil"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// UniversalSearch runs three bounded queries — endpoints, certificates,
// scanners — and returns up to `limit` matches from each. Intended for the
// header command-search dropdown; not a pagination surface.
//
// Endpoint matching branches on the input shape:
//
//   - IP-shaped query (e.g. "10.0.5", "fe80::1") → exact + prefix match
//     across the three IP-bearing columns on endpoint_hosts: dns_name
//     (which may itself be an IP literal), ip_address (operator override),
//     and last_resolved_ip (scanner observation). ILIKE substring is the
//     wrong semantics for IP fragments — "10.0.5" should not match
//     "110.0.5.7", and substring matching across IPv6 yields gibberish.
//
//   - Text query → existing ILIKE substring on h.name, eh.dns_name, and
//     es.url, which is the right behavior for hostnames and SAML URLs.
//
// Certificate and scanner matching are unaffected — both stay on text-style
// substring matching regardless of input shape. Cert matches against an IP
// literal in a SAN are vanishingly rare and not worth special-casing yet.
func (s *Store) UniversalSearch(ctx context.Context, q string, limit int) (models.SearchResults, error) {
	pattern := "%" + q + "%"
	prefix := q + "%"

	type endpointRow struct {
		ID             string  `bun:"id"`
		Name           string  `bun:"name"`
		Type           string  `bun:"type"`
		DNSName        *string `bun:"dns_name"`
		IPAddress      *string `bun:"ip_address"`
		LastResolvedIP *string `bun:"last_resolved_ip"`
		URL            *string `bun:"url"`
	}
	var endpointRows []endpointRow
	endpointQuery := s.db.NewSelect().
		TableExpr("tlsentinel.endpoints AS h").
		ColumnExpr("h.id, h.name, h.type, eh.dns_name AS dns_name, eh.ip_address AS ip_address, eh.last_resolved_ip AS last_resolved_ip, es.url AS url").
		Join("LEFT JOIN tlsentinel.endpoint_hosts AS eh ON eh.endpoint_id = h.id").
		Join("LEFT JOIN tlsentinel.endpoint_saml AS es ON es.endpoint_id = h.id").
		OrderExpr("h.name ASC").
		Limit(limit)

	ipShaped := iputil.LooksLikeIP(q)
	if ipShaped {
		// Exact match wins (full IP literal); LIKE prefix catches partials
		// like "10.0.5" → "10.0.5.7". Both are b-tree-friendly and benefit
		// from idx_endpoint_hosts_last_resolved_ip; the dns_name index
		// covers eh.dns_name; ip_address is searched without an index but
		// the column is sparse.
		endpointQuery = endpointQuery.Where(
			"eh.dns_name = ? OR eh.ip_address = ? OR eh.last_resolved_ip = ? "+
				"OR eh.dns_name LIKE ? OR eh.ip_address LIKE ? OR eh.last_resolved_ip LIKE ?",
			q, q, q, prefix, prefix, prefix,
		)
	} else {
		endpointQuery = endpointQuery.Where(
			"h.name ILIKE ? OR eh.dns_name ILIKE ? OR es.url ILIKE ?",
			pattern, pattern, pattern,
		)
	}
	if err := endpointQuery.Scan(ctx, &endpointRows); err != nil {
		return models.SearchResults{}, fmt.Errorf("search endpoints: %w", err)
	}
	endpoints := make([]models.SearchEndpoint, len(endpointRows))
	for i, r := range endpointRows {
		endpoints[i] = models.SearchEndpoint{
			ID:       r.ID,
			Name:     r.Name,
			Type:     r.Type,
			Subtitle: pickSubtitle(q, ipShaped, r.DNSName, r.IPAddress, r.URL),
		}
	}

	var certificates []models.SearchCertificate
	err := s.db.NewSelect().
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

// pickSubtitle chooses what to render as the secondary line on an endpoint
// search result. The display rules:
//
//   - When the query is IP-shaped and the operator-supplied ip_address
//     override matched it, surface the override (so the user sees why the
//     row appeared even when dns_name is a hostname).
//   - Otherwise fall back to dns_name (which itself may be an IP literal),
//     then the SAML url, then empty for manual endpoints.
//
// last_resolved_ip is intentionally never surfaced as a subtitle on its
// own — when it is the matching column, the row still displays its
// hostname dns_name and the user clicks through to find the IP on the
// detail page (or via the API).
func pickSubtitle(q string, ipShaped bool, dnsName, ipAddress, url *string) string {
	if ipShaped && ipAddress != nil {
		v := *ipAddress
		if v == q || strings.HasPrefix(v, q) {
			return v
		}
	}
	if dnsName != nil && *dnsName != "" {
		return *dnsName
	}
	if url != nil {
		return *url
	}
	return ""
}
