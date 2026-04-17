package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/uptrace/bun"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

func groupToModel(g Group) models.Group {
	return models.Group{
		ID:          g.ID,
		Name:        g.Name,
		Description: g.Description,
		CreatedAt:   g.CreatedAt,
		UpdatedAt:   g.UpdatedAt,
	}
}

// ListGroups returns a paginated list of groups ordered by name.
func (s *Store) ListGroups(ctx context.Context, page, pageSize int) (models.GroupList, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	var rows []Group
	total, err := s.db.NewSelect().
		Model(&rows).
		OrderExpr("name ASC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		ScanAndCount(ctx)
	if err != nil {
		return models.GroupList{}, fmt.Errorf("failed to list groups: %w", err)
	}

	items := make([]models.Group, len(rows))
	for i, r := range rows {
		items[i] = groupToModel(r)
	}
	return models.GroupList{Items: items, Page: page, PageSize: pageSize, TotalCount: total}, nil
}

// GetGroupByID fetches a single group by ID.
func (s *Store) GetGroupByID(ctx context.Context, id string) (models.Group, error) {
	var row Group
	err := s.db.NewSelect().Model(&row).Where("id = ?", id).Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.Group{}, ErrNotFound
		}
		return models.Group{}, fmt.Errorf("failed to get group: %w", err)
	}
	return groupToModel(row), nil
}

// InsertGroup creates a new group.
func (s *Store) InsertGroup(ctx context.Context, name string, description *string) (models.Group, error) {
	row := Group{
		Name:        name,
		Description: description,
	}
	_, err := s.db.NewInsert().Model(&row).ExcludeColumn("id", "created_at", "updated_at").Returning("*").Exec(ctx)
	if err != nil {
		return models.Group{}, fmt.Errorf("failed to insert group: %w", err)
	}
	return groupToModel(row), nil
}

// UpdateGroup updates a group's name and description.
func (s *Store) UpdateGroup(ctx context.Context, id, name string, description *string) (models.Group, error) {
	res, err := s.db.NewUpdate().
		TableExpr("tlsentinel.groups").
		Set("name = ?", name).
		Set("description = ?", description).
		Set("updated_at = NOW()").
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return models.Group{}, fmt.Errorf("failed to update group: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return models.Group{}, ErrNotFound
	}
	return s.GetGroupByID(ctx, id)
}

// ListGroupHostIDs returns the IDs of hosts assigned to a group.
func (s *Store) ListGroupHostIDs(ctx context.Context, groupID string) ([]string, error) {
	var ids []string
	err := s.db.NewSelect().
		TableExpr("tlsentinel.host_groups").
		ColumnExpr("host_id").
		Where("group_id = ?", groupID).
		Scan(ctx, &ids)
	if err != nil {
		return nil, fmt.Errorf("failed to list group host ids: %w", err)
	}
	return ids, nil
}

// ReplaceGroupHosts atomically replaces all host assignments for a group.
// Duplicate host IDs in the input are silently deduplicated. Returns
// ErrInvalidInput if any supplied host ID does not reference an existing host.
func (s *Store) ReplaceGroupHosts(ctx context.Context, groupID string, hostIDs []string) error {
	// Dedupe preserving order — callers may supply the same ID twice and we
	// don't want that to trip the count check below.
	seen := make(map[string]struct{}, len(hostIDs))
	unique := make([]string, 0, len(hostIDs))
	for _, id := range hostIDs {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}

	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if len(unique) > 0 {
			var count int
			if err := tx.NewSelect().
				TableExpr("tlsentinel.hosts").
				ColumnExpr("count(*)").
				Where("id IN (?)", bun.In(unique)).
				Scan(ctx, &count); err != nil {
				return fmt.Errorf("failed to validate host ids: %w", err)
			}
			if count != len(unique) {
				return ErrInvalidInput
			}
		}

		// Remove all existing assignments.
		if _, err := tx.NewDelete().
			TableExpr("tlsentinel.host_groups").
			Where("group_id = ?", groupID).
			Exec(ctx); err != nil {
			return fmt.Errorf("failed to clear group hosts: %w", err)
		}

		if len(unique) == 0 {
			return nil
		}

		rows := make([]HostGroup, len(unique))
		for i, hid := range unique {
			rows[i] = HostGroup{HostID: hid, GroupID: groupID}
		}
		if _, err := tx.NewInsert().Model(&rows).Exec(ctx); err != nil {
			return fmt.Errorf("failed to insert group hosts: %w", err)
		}
		return nil
	})
}

// DeleteGroup removes a group by ID.
func (s *Store) DeleteGroup(ctx context.Context, id string) error {
	res, err := s.db.NewDelete().
		Model((*Group)(nil)).
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete group: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
