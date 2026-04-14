package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

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

