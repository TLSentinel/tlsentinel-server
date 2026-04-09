package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

func scheduledJobToModel(r ScheduledJob) models.ScheduledJob {
	m := models.ScheduledJob{
		Name:           r.Name,
		DisplayName:    r.DisplayName,
		CronExpression: r.CronExpression,
		Enabled:        r.Enabled,
		LastRunStatus:  r.LastRunStatus,
	}
	if r.LastRunAt != nil {
		s := r.LastRunAt.UTC().Format(time.RFC3339)
		m.LastRunAt = &s
	}
	return m
}

// ListScheduledJobs returns all scheduled jobs ordered by name.
func (s *Store) ListScheduledJobs(ctx context.Context) ([]models.ScheduledJob, error) {
	var rows []ScheduledJob
	err := s.db.NewSelect().
		Model(&rows).
		OrderExpr("name ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list scheduled jobs: %w", err)
	}
	out := make([]models.ScheduledJob, len(rows))
	for i, r := range rows {
		out[i] = scheduledJobToModel(r)
	}
	return out, nil
}

// GetScheduledJob returns a single job by name.
func (s *Store) GetScheduledJob(ctx context.Context, name string) (models.ScheduledJob, error) {
	var row ScheduledJob
	err := s.db.NewSelect().
		Model(&row).
		Where("name = ?", name).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.ScheduledJob{}, ErrNotFound
		}
		return models.ScheduledJob{}, fmt.Errorf("failed to get scheduled job %q: %w", name, err)
	}
	return scheduledJobToModel(row), nil
}

// UpsertScheduledJob updates the cron expression and enabled flag for an existing job.
func (s *Store) UpsertScheduledJob(ctx context.Context, name, cronExpression string, enabled bool) (models.ScheduledJob, error) {
	var row ScheduledJob
	err := s.db.NewSelect().
		Model(&row).
		Where("name = ?", name).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.ScheduledJob{}, ErrNotFound
		}
		return models.ScheduledJob{}, fmt.Errorf("failed to fetch job %q: %w", name, err)
	}
	row.CronExpression = cronExpression
	row.Enabled = enabled
	_, err = s.db.NewUpdate().
		Model(&row).
		Column("cron_expression", "enabled", "updated_at").
		Where("name = ?", name).
		Exec(ctx)
	if err != nil {
		return models.ScheduledJob{}, fmt.Errorf("failed to update scheduled job %q: %w", name, err)
	}
	return scheduledJobToModel(row), nil
}

// UpdateJobLastRun records the completion time and result of a job run.
func (s *Store) UpdateJobLastRun(ctx context.Context, name, status string) error {
	now := time.Now().UTC()
	_, err := s.db.NewUpdate().
		TableExpr("tlsentinel.scheduled_jobs").
		Set("last_run_at = ?", now).
		Set("last_run_status = ?", status).
		Where("name = ?", name).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to update last run for job %q: %w", name, err)
	}
	return nil
}
