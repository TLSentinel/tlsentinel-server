package db

import "context"

func (s *Store) LogAuditEvent(ctx context.Context, entry AuditLog) error {
	_, err := s.db.NewInsert().Model(&entry).ExcludeColumn("id").Exec(ctx)
	return err
}
