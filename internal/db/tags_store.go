package db

import (
	"context"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/uptrace/bun"
)

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

func (s *Store) ListTagCategories(ctx context.Context) ([]models.CategoryWithTags, error) {
	var cats []TagCategory
	if err := s.db.NewSelect().Model(&cats).OrderExpr("tc.name ASC").Scan(ctx); err != nil {
		return nil, fmt.Errorf("failed to list tag categories: %w", err)
	}

	var tags []Tag
	if err := s.db.NewSelect().Model(&tags).OrderExpr("t.name ASC").Scan(ctx); err != nil {
		return nil, fmt.Errorf("failed to list tags: %w", err)
	}

	// Index tags by category.
	tagsByCategory := make(map[string][]models.Tag)
	for _, t := range tags {
		tagsByCategory[t.CategoryID] = append(tagsByCategory[t.CategoryID], models.Tag{
			ID:          t.ID,
			CategoryID:  t.CategoryID,
			Name:        t.Name,
			Description: t.Description,
			CreatedAt:   t.CreatedAt,
		})
	}

	result := make([]models.CategoryWithTags, len(cats))
	for i, c := range cats {
		ts := tagsByCategory[c.ID]
		if ts == nil {
			ts = []models.Tag{}
		}
		result[i] = models.CategoryWithTags{
			ID:          c.ID,
			Name:        c.Name,
			Description: c.Description,
			CreatedAt:   c.CreatedAt,
			Tags:        ts,
		}
	}
	return result, nil
}

func (s *Store) CreateTagCategory(ctx context.Context, req models.CreateTagCategoryRequest) (models.TagCategory, error) {
	row := &TagCategory{
		Name:        req.Name,
		Description: req.Description,
	}
	if _, err := s.db.NewInsert().Model(row).ExcludeColumn("id", "created_at", "updated_at").Returning("*").Exec(ctx); err != nil {
		return models.TagCategory{}, fmt.Errorf("failed to create tag category: %w", err)
	}
	return models.TagCategory{
		ID:          row.ID,
		Name:        row.Name,
		Description: row.Description,
		CreatedAt:   row.CreatedAt,
	}, nil
}

func (s *Store) UpdateTagCategory(ctx context.Context, id string, req models.UpdateTagCategoryRequest) (models.TagCategory, error) {
	row := &TagCategory{}
	_, err := s.db.NewUpdate().Model(row).
		Set("name = ?", req.Name).
		Set("description = ?", req.Description).
		Set("updated_at = NOW()").
		Where("id = ?", id).
		Returning("*").
		Exec(ctx)
	if err != nil {
		return models.TagCategory{}, fmt.Errorf("failed to update tag category: %w", err)
	}
	return models.TagCategory{
		ID:          row.ID,
		Name:        row.Name,
		Description: row.Description,
		CreatedAt:   row.CreatedAt,
	}, nil
}

func (s *Store) DeleteTagCategory(ctx context.Context, id string) error {
	res, err := s.db.NewDelete().Model((*TagCategory)(nil)).Where("id = ?", id).Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete tag category: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

func (s *Store) CreateTag(ctx context.Context, req models.CreateTagRequest) (models.Tag, error) {
	row := &Tag{
		CategoryID:  req.CategoryID,
		Name:        req.Name,
		Description: req.Description,
	}
	if _, err := s.db.NewInsert().Model(row).ExcludeColumn("id", "created_at").Returning("*").Exec(ctx); err != nil {
		return models.Tag{}, fmt.Errorf("failed to create tag: %w", err)
	}
	return models.Tag{
		ID:          row.ID,
		CategoryID:  row.CategoryID,
		Name:        row.Name,
		Description: row.Description,
		CreatedAt:   row.CreatedAt,
	}, nil
}

func (s *Store) UpdateTag(ctx context.Context, id string, req models.UpdateTagRequest) (models.Tag, error) {
	row := &Tag{}
	_, err := s.db.NewUpdate().Model(row).
		Set("name = ?", req.Name).
		Set("description = ?", req.Description).
		Where("id = ?", id).
		Returning("*").
		Exec(ctx)
	if err != nil {
		return models.Tag{}, fmt.Errorf("failed to update tag: %w", err)
	}
	return models.Tag{
		ID:          row.ID,
		CategoryID:  row.CategoryID,
		Name:        row.Name,
		Description: row.Description,
		CreatedAt:   row.CreatedAt,
	}, nil
}

func (s *Store) DeleteTag(ctx context.Context, id string) error {
	res, err := s.db.NewDelete().Model((*Tag)(nil)).Where("id = ?", id).Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete tag: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// ListAllTags returns every tag in the system with its category embedded,
// flat-sorted by category name then tag name. Useful for filter pickers and
// autocomplete where the category grouping of ListTagCategories is overkill.
func (s *Store) ListAllTags(ctx context.Context) ([]models.TagWithCategory, error) {
	type row struct {
		TagID           string  `bun:"tag_id"`
		TagName         string  `bun:"tag_name"`
		TagDescription  *string `bun:"tag_description"`
		CategoryID      string  `bun:"category_id"`
		CategoryName    string  `bun:"category_name"`
	}
	var rows []row
	err := s.db.NewSelect().
		TableExpr("tlsentinel.tags t").
		ColumnExpr("t.id AS tag_id, t.name AS tag_name, t.description AS tag_description, t.category_id, tc.name AS category_name").
		Join("JOIN tlsentinel.tag_categories tc ON tc.id = t.category_id").
		OrderExpr("tc.name ASC, t.name ASC").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("failed to list tags: %w", err)
	}

	result := make([]models.TagWithCategory, len(rows))
	for i, r := range rows {
		result[i] = models.TagWithCategory{
			ID:           r.TagID,
			CategoryID:   r.CategoryID,
			CategoryName: r.CategoryName,
			Name:         r.TagName,
			Description:  r.TagDescription,
		}
	}
	return result, nil
}

// ---------------------------------------------------------------------------
// Endpoint tags
// ---------------------------------------------------------------------------

func (s *Store) GetEndpointTags(ctx context.Context, endpointID string) ([]models.TagWithCategory, error) {
	type row struct {
		TagID        string `bun:"tag_id"`
		TagName      string `bun:"tag_name"`
		CategoryID   string `bun:"category_id"`
		CategoryName string `bun:"category_name"`
	}
	var rows []row
	err := s.db.NewSelect().
		TableExpr("tlsentinel.endpoint_tags et").
		ColumnExpr("et.tag_id, t.name AS tag_name, t.category_id, tc.name AS category_name").
		Join("JOIN tlsentinel.tags t ON t.id = et.tag_id").
		Join("JOIN tlsentinel.tag_categories tc ON tc.id = t.category_id").
		Where("et.endpoint_id = ?", endpointID).
		OrderExpr("tc.name ASC, t.name ASC").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("failed to get endpoint tags: %w", err)
	}

	result := make([]models.TagWithCategory, len(rows))
	for i, r := range rows {
		result[i] = models.TagWithCategory{
			ID:           r.TagID,
			CategoryID:   r.CategoryID,
			CategoryName: r.CategoryName,
			Name:         r.TagName,
		}
	}
	return result, nil
}

// SetEndpointTags atomically replaces all tags on an endpoint. Duplicate tag
// IDs in the input are silently deduplicated. Returns ErrInvalidInput if any
// supplied tag ID does not reference an existing tag.
func (s *Store) SetEndpointTags(ctx context.Context, endpointID string, tagIDs []string) error {
	seen := make(map[string]struct{}, len(tagIDs))
	unique := make([]string, 0, len(tagIDs))
	for _, id := range tagIDs {
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
				TableExpr("tlsentinel.tags").
				ColumnExpr("count(*)").
				Where("id IN (?)", bun.In(unique)).
				Scan(ctx, &count); err != nil {
				return fmt.Errorf("failed to validate tag ids: %w", err)
			}
			if count != len(unique) {
				return ErrInvalidInput
			}
		}

		_, err := tx.NewDelete().
			Model((*EndpointTag)(nil)).
			Where("endpoint_id = ?", endpointID).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("failed to clear endpoint tags: %w", err)
		}

		if len(unique) == 0 {
			return nil
		}

		rows := make([]EndpointTag, len(unique))
		for i, tid := range unique {
			rows[i] = EndpointTag{EndpointID: endpointID, TagID: tid}
		}
		if _, err := tx.NewInsert().Model(&rows).Exec(ctx); err != nil {
			return fmt.Errorf("failed to insert endpoint tags: %w", err)
		}
		return nil
	})
}
