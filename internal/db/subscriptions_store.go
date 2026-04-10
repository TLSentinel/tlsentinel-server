package db

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// GetUserTagSubscriptions returns all tag subscriptions for a user, enriched
// with tag name and category information, ordered by category then tag name.
func (s *Store) GetUserTagSubscriptions(ctx context.Context, userID string) ([]models.TagWithCategory, error) {
	type row struct {
		TagID        string `bun:"tag_id"`
		TagName      string `bun:"tag_name"`
		CategoryID   string `bun:"category_id"`
		CategoryName string `bun:"category_name"`
	}
	var rows []row
	err := s.db.NewSelect().
		TableExpr("tlsentinel.user_tag_subscriptions uts").
		ColumnExpr("uts.tag_id, t.name AS tag_name, t.category_id, tc.name AS category_name").
		Join("JOIN tlsentinel.tags t ON t.id = uts.tag_id").
		Join("JOIN tlsentinel.tag_categories tc ON tc.id = t.category_id").
		Where("uts.user_id = ?", userID).
		OrderExpr("tc.name ASC, t.name ASC").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("failed to get tag subscriptions: %w", err)
	}
	out := make([]models.TagWithCategory, len(rows))
	for i, r := range rows {
		out[i] = models.TagWithCategory{
			ID:           r.TagID,
			CategoryID:   r.CategoryID,
			CategoryName: r.CategoryName,
			Name:         r.TagName,
		}
	}
	return out, nil
}

// SetUserTagSubscriptions replaces the full set of tag subscriptions for a user
// atomically. Passing an empty slice clears all subscriptions (reverts to
// notify-all behaviour).
func (s *Store) SetUserTagSubscriptions(ctx context.Context, userID string, tagIDs []string) error {
	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewDelete().
			TableExpr("tlsentinel.user_tag_subscriptions").
			Where("user_id = ?", userID).
			Exec(ctx); err != nil {
			return fmt.Errorf("failed to clear tag subscriptions: %w", err)
		}
		if len(tagIDs) == 0 {
			return nil
		}
		rows := make([]UserTagSubscription, len(tagIDs))
		for i, id := range tagIDs {
			rows[i] = UserTagSubscription{UserID: userID, TagID: id}
		}
		if _, err := tx.NewInsert().Model(&rows).Exec(ctx); err != nil {
			return fmt.Errorf("failed to insert tag subscriptions: %w", err)
		}
		return nil
	})
}
