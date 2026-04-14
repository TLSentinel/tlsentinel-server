package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/uptrace/bun"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// DiscoveryNetworkWithScanner is used for queries that LEFT JOIN scanners.
type discoveryNetworkWithScanner struct {
	DiscoveryNetwork
	ScannerName *string `bun:"scanner_name"`
}

func discoveryNetworkToModel(r discoveryNetworkWithScanner) models.DiscoveryNetwork {
	ports := make([]int, len(r.Ports))
	for i, p := range r.Ports {
		ports[i] = int(p)
	}
	return models.DiscoveryNetwork{
		ID:             r.ID,
		Name:           r.Name,
		Range:          r.Range,
		Ports:          ports,
		ScannerID:      r.ScannerID,
		ScannerName:    r.ScannerName,
		CronExpression: r.CronExpression,
		Enabled:        r.Enabled,
		CreatedAt:      r.CreatedAt,
		UpdatedAt:      r.UpdatedAt,
	}
}

func (s *Store) listDiscoveryNetworksQuery() *discoveryNetworkWithScanner {
	return nil // placeholder — used to document query shape
}

// ListDiscoveryNetworks returns all discovery networks ordered by name.
func (s *Store) ListDiscoveryNetworks(ctx context.Context, page, pageSize int) (models.DiscoveryNetworkList, error) {
	type row = discoveryNetworkWithScanner

	var rows []row
	q := s.db.NewSelect().
		TableExpr("tlsentinel.discovery_networks dn").
		ColumnExpr("dn.*").
		ColumnExpr("sc.name AS scanner_name").
		Join("LEFT JOIN tlsentinel.scanners sc ON sc.id = dn.scanner_id").
		OrderExpr("dn.name ASC")

	total, err := q.Count(ctx)
	if err != nil {
		return models.DiscoveryNetworkList{}, fmt.Errorf("failed to count discovery networks: %w", err)
	}

	if err := q.Limit(pageSize).Offset((page - 1) * pageSize).Scan(ctx, &rows); err != nil {
		return models.DiscoveryNetworkList{}, fmt.Errorf("failed to list discovery networks: %w", err)
	}

	items := make([]models.DiscoveryNetwork, len(rows))
	for i, r := range rows {
		items[i] = discoveryNetworkToModel(r)
	}

	return models.DiscoveryNetworkList{Items: items, TotalCount: total}, nil
}

// GetDiscoveryNetwork returns a single discovery network by ID.
func (s *Store) GetDiscoveryNetwork(ctx context.Context, id string) (models.DiscoveryNetwork, error) {
	var row discoveryNetworkWithScanner
	err := s.db.NewSelect().
		TableExpr("tlsentinel.discovery_networks dn").
		ColumnExpr("dn.*").
		ColumnExpr("sc.name AS scanner_name").
		Join("LEFT JOIN tlsentinel.scanners sc ON sc.id = dn.scanner_id").
		Where("dn.id = ?", id).
		Scan(ctx, &row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.DiscoveryNetwork{}, ErrNotFound
		}
		return models.DiscoveryNetwork{}, fmt.Errorf("failed to get discovery network: %w", err)
	}
	return discoveryNetworkToModel(row), nil
}

// InsertDiscoveryNetwork creates a new discovery network.
func (s *Store) InsertDiscoveryNetwork(ctx context.Context, req models.CreateDiscoveryNetworkRequest) (models.DiscoveryNetwork, error) {
	ports := make([]int32, len(req.Ports))
	for i, p := range req.Ports {
		ports[i] = int32(p)
	}

	row := &DiscoveryNetwork{
		Name:           req.Name,
		Range:          req.Range,
		Ports:          ports,
		ScannerID:      req.ScannerID,
		CronExpression: req.CronExpression,
		Enabled:        req.Enabled,
	}

	if _, err := s.db.NewInsert().Model(row).
		ExcludeColumn("id", "created_at", "updated_at").
		Returning("*").
		Exec(ctx); err != nil {
		return models.DiscoveryNetwork{}, fmt.Errorf("failed to insert discovery network: %w", err)
	}

	return s.GetDiscoveryNetwork(ctx, row.ID)
}

// UpdateDiscoveryNetwork replaces all mutable fields of a discovery network.
func (s *Store) UpdateDiscoveryNetwork(ctx context.Context, id string, req models.UpdateDiscoveryNetworkRequest) (models.DiscoveryNetwork, error) {
	ports := make([]int32, len(req.Ports))
	for i, p := range req.Ports {
		ports[i] = int32(p)
	}

	row := &DiscoveryNetwork{
		ID:             id,
		Name:           req.Name,
		Range:          req.Range,
		Ports:          ports,
		ScannerID:      req.ScannerID,
		CronExpression: req.CronExpression,
		Enabled:        req.Enabled,
	}

	res, err := s.db.NewUpdate().
		Model(row).
		Column("name", "range", "ports", "scanner_id", "cron_expression", "enabled").
		Set("updated_at = NOW()").
		WherePK().
		Exec(ctx)
	if err != nil {
		return models.DiscoveryNetwork{}, fmt.Errorf("failed to update discovery network: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return models.DiscoveryNetwork{}, ErrNotFound
	}
	return s.GetDiscoveryNetwork(ctx, id)
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

type discoveryInboxWithJoins struct {
	DiscoveryInboxItem
	NetworkName  *string `bun:"network_name"`
	ScannerName  *string `bun:"scanner_name"`
	EndpointName *string `bun:"endpoint_name"`
	CommonName   *string `bun:"common_name"`
}

func discoveryInboxToModel(r discoveryInboxWithJoins) models.DiscoveryInboxItem {
	return models.DiscoveryInboxItem{
		ID:           r.ID,
		NetworkID:    r.NetworkID,
		NetworkName:  r.NetworkName,
		ScannerID:    r.ScannerID,
		ScannerName:  r.ScannerName,
		IP:           r.IP,
		RDNS:         r.RDNS,
		Port:         r.Port,
		Fingerprint:  r.Fingerprint,
		CommonName:   r.CommonName,
		Status:       r.Status,
		EndpointID:   r.EndpointID,
		EndpointName: r.EndpointName,
		FirstSeenAt:  r.FirstSeenAt,
		LastSeenAt:   r.LastSeenAt,
	}
}

func (s *Store) inboxBaseQuery() *bun.SelectQuery {
	return s.db.NewSelect().
		TableExpr("tlsentinel.discovery_inbox di").
		ColumnExpr("di.*").
		ColumnExpr("dn.name AS network_name").
		ColumnExpr("sc.name AS scanner_name").
		ColumnExpr("ep.name AS endpoint_name").
		ColumnExpr("c.common_name AS common_name").
		Join("LEFT JOIN tlsentinel.discovery_networks dn ON dn.id = di.network_id").
		Join("LEFT JOIN tlsentinel.scanners sc ON sc.id = di.scanner_id").
		Join("LEFT JOIN tlsentinel.endpoints ep ON ep.id = di.endpoint_id").
		Join("LEFT JOIN tlsentinel.certificates c ON c.fingerprint = di.fingerprint").
		OrderExpr("di.last_seen_at DESC")
}

// ListDiscoveryInbox returns a paginated list of inbox items with optional filters.
func (s *Store) ListDiscoveryInbox(ctx context.Context, page, pageSize int, networkID, status string) (models.DiscoveryInboxList, error) {
	q := s.inboxBaseQuery()

	if networkID != "" {
		q = q.Where("di.network_id = ?", networkID)
	}
	if status != "" {
		q = q.Where("di.status = ?", status)
	}

	total, err := q.Count(ctx)
	if err != nil {
		return models.DiscoveryInboxList{}, fmt.Errorf("failed to count discovery inbox: %w", err)
	}

	var rows []discoveryInboxWithJoins
	if err := q.Limit(pageSize).Offset((page - 1) * pageSize).Scan(ctx, &rows); err != nil {
		return models.DiscoveryInboxList{}, fmt.Errorf("failed to list discovery inbox: %w", err)
	}

	items := make([]models.DiscoveryInboxItem, len(rows))
	for i, r := range rows {
		items[i] = discoveryInboxToModel(r)
	}

	return models.DiscoveryInboxList{Items: items, TotalCount: total}, nil
}

// GetDiscoveryInboxItem returns a single inbox item by ID.
func (s *Store) GetDiscoveryInboxItem(ctx context.Context, id string) (models.DiscoveryInboxItem, error) {
	var row discoveryInboxWithJoins
	err := s.inboxBaseQuery().Where("di.id = ?", id).Scan(ctx, &row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.DiscoveryInboxItem{}, ErrNotFound
		}
		return models.DiscoveryInboxItem{}, fmt.Errorf("failed to get discovery inbox item: %w", err)
	}
	return discoveryInboxToModel(row), nil
}

// DeleteDiscoveryNetwork removes a discovery network by ID (cascades to inbox).
func (s *Store) DeleteDiscoveryNetwork(ctx context.Context, id string) error {
	res, err := s.db.NewDelete().
		Model((*DiscoveryNetwork)(nil)).
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete discovery network: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

