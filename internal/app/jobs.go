package app

import (
	"context"
	"log/slog"

	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/notifications"
	"github.com/tlsentinel/tlsentinel-server/internal/rootstore"
	"github.com/tlsentinel/tlsentinel-server/internal/scheduler"
)

// loadScheduledJobs reads enabled jobs from the database and registers each
// one with the scheduler. Unknown or disabled jobs are skipped with a log
// line. Each registered job updates its last-run timestamp on completion.
func loadScheduledJobs(ctx context.Context, store *db.Store, sched *scheduler.Scheduler, registry map[string]func(context.Context), log *slog.Logger) {
	dbJobs, err := store.ListScheduledJobs(ctx)
	if err != nil {
		log.Warn("failed to load scheduled jobs from DB, scheduler not started", "error", err)
		return
	}
	for _, job := range dbJobs {
		if !job.Enabled {
			log.Info("job disabled, skipping", "job", job.Name)
			continue
		}
		fn, ok := registry[job.Name]
		if !ok {
			log.Warn("no handler registered for job", "job", job.Name)
			continue
		}
		jobName := job.Name
		sched.Add(job.CronExpression, job.DisplayName, func(ctx context.Context) {
			fn(ctx)
			// Bookkeeping uses Background so we still record completion even
			// if the job context was cancelled or deadline-exceeded.
			if err := store.UpdateJobLastRun(context.Background(), jobName, "success"); err != nil {
				log.Warn("failed to update job last run", "job", jobName, "error", err)
			}
		})
	}
}

func buildJobRegistry(store *db.Store, enc *crypto.Encryptor, log *slog.Logger) map[string]func(context.Context) {
	return map[string]func(context.Context){
		models.JobExpiryAlerts: func(ctx context.Context) {
			notifications.RunExpiryAlerts(ctx, store, enc, log)
		},
		models.JobPurgeScanHistory: func(ctx context.Context) {
			days, err := store.GetScanHistoryRetentionDays(ctx)
			if err != nil {
				log.Error("purge scan history: failed to get retention setting", "error", err)
				return
			}
			deleted, err := store.PurgeScanHistory(ctx, days)
			if err != nil {
				log.Error("purge scan history failed", "error", err)
				return
			}
			log.Info("purge scan history complete", "deleted", deleted, "retention_days", days)
		},
		models.JobPurgeExpiryAlerts: func(ctx context.Context) {
			deleted, err := store.PurgeExpiryAlerts(ctx)
			if err != nil {
				log.Error("purge expiry alerts failed", "error", err)
				return
			}
			log.Info("purge expiry alerts complete", "deleted", deleted)
		},
		models.JobPurgeUnreferencedCerts: func(ctx context.Context) {
			deleted, err := store.PurgeUnreferencedCerts(ctx)
			if err != nil {
				log.Error("purge unreferenced certs failed", "error", err)
				return
			}
			log.Info("purge unreferenced certs complete", "deleted", deleted)
		},
		models.JobRefreshRootStores: func(ctx context.Context) {
			if err := rootstore.Refresh(ctx, store, log); err != nil {
				log.Error("refresh root stores failed", "error", err)
				return
			}
			log.Info("refresh root stores complete")
		},
		models.JobPurgeAuditLogs: func(ctx context.Context) {
			days, err := store.GetAuditLogRetentionDays(ctx)
			if err != nil {
				log.Error("purge audit logs: failed to get retention setting", "error", err)
				return
			}
			deleted, err := store.PurgeAuditLogs(ctx, days)
			if err != nil {
				log.Error("purge audit logs failed", "error", err)
				return
			}
			log.Info("purge audit logs complete", "deleted", deleted, "retention_days", days)
		},
	}
}
