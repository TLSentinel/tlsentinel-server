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
			ID:         t.ID,
			CategoryID: t.CategoryID,
			Name:       t.Name,
			CreatedAt:  t.CreatedAt,
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

func (s *Store) DeleteTagCategory(ctx context.Context, id string) error {
	_, err := s.db.NewDelete().Model((*TagCategory)(nil)).Where("id = ?", id).Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete tag category: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

func (s *Store) CreateTag(ctx context.Context, req models.CreateTagRequest) (models.Tag, error) {
	row := &Tag{
		CategoryID: req.CategoryID,
		Name:       req.Name,
	}
	if _, err := s.db.NewInsert().Model(row).ExcludeColumn("id", "created_at").Returning("*").Exec(ctx); err != nil {
		return models.Tag{}, fmt.Errorf("failed to create tag: %w", err)
	}
	return models.Tag{
		ID:         row.ID,
		CategoryID: row.CategoryID,
		Name:       row.Name,
		CreatedAt:  row.CreatedAt,
	}, nil
}

func (s *Store) DeleteTag(ctx context.Context, id string) error {
	_, err := s.db.NewDelete().Model((*Tag)(nil)).Where("id = ?", id).Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete tag: %w", err)
	}
	return nil
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

func (s *Store) SetEndpointTags(ctx context.Context, endpointID string, tagIDs []string) error {
	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		_, err := tx.NewDelete().
			Model((*EndpointTag)(nil)).
			Where("endpoint_id = ?", endpointID).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("failed to clear endpoint tags: %w", err)
		}

		if len(tagIDs) == 0 {
			return nil
		}

		rows := make([]EndpointTag, len(tagIDs))
		for i, tid := range tagIDs {
			rows[i] = EndpointTag{EndpointID: endpointID, TagID: tid}
		}
		_, err = tx.NewInsert().Model(&rows).On("CONFLICT DO NOTHING").Exec(ctx)
		if err != nil {
			return fmt.Errorf("failed to insert endpoint tags: %w", err)
		}
		return nil
	})
}
