package db

import (
	"context"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

func (s *Store) LogAuditEvent(ctx context.Context, entry AuditLog) error {
	_, err := s.db.NewInsert().Model(&entry).ExcludeColumn("id", "created_at").Exec(ctx)
	return err
}

func (s *Store) ListAuditLogs(ctx context.Context, page, pageSize int, username, action string) (models.AuditLogList, error) {
	var rows []AuditLog

	q := s.db.NewSelect().
		Model(&rows).
		OrderExpr("created_at DESC").
		Limit(pageSize).
		Offset((page - 1) * pageSize)

	if username != "" {
		q = q.Where("username ILIKE ?", "%"+username+"%")
	}
	if action != "" {
		q = q.Where("action = ?", action)
	}

	total, err := q.ScanAndCount(ctx)
	if err != nil {
		return models.AuditLogList{}, fmt.Errorf("list audit logs: %w", err)
	}

	items := make([]models.AuditLog, len(rows))
	for i, r := range rows {
		items[i] = models.AuditLog{
			ID:           r.ID,
			UserID:       r.UserID,
			Username:     r.Username,
			Action:       r.Action,
			ResourceType: r.ResourceType,
			ResourceID:   r.ResourceID,
			IPAddress:    r.IPAddress,
			CreatedAt:    r.CreatedAt,
		}
	}

	return models.AuditLogList{
		Items:      items,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
	}, nil
}
