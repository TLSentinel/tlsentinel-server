package app

import (
	"context"

	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/notifications"
	"github.com/tlsentinel/tlsentinel-server/internal/scheduler"
	"go.uber.org/zap"
)

// loadScheduledJobs reads enabled jobs from the database and registers each
// one with the scheduler. Unknown or disabled jobs are skipped with a log
// line. Each registered job updates its last-run timestamp on completion.
func loadScheduledJobs(ctx context.Context, store *db.Store, sched *scheduler.Scheduler, registry map[string]func(), log *zap.Logger) {
	dbJobs, err := store.ListScheduledJobs(ctx)
	if err != nil {
		log.Warn("failed to load scheduled jobs from DB, scheduler not started", zap.Error(err))
		return
	}
	for _, job := range dbJobs {
		if !job.Enabled {
			log.Info("job disabled, skipping", zap.String("job", job.Name))
			continue
		}
		fn, ok := registry[job.Name]
		if !ok {
			log.Warn("no handler registered for job", zap.String("job", job.Name))
			continue
		}
		jobName := job.Name
		sched.Add(job.CronExpression, job.DisplayName, func() {
			fn()
			if err := store.UpdateJobLastRun(context.Background(), jobName, "success"); err != nil {
				log.Warn("failed to update job last run", zap.String("job", jobName), zap.Error(err))
			}
		})
	}
}

func buildJobRegistry(store *db.Store, enc *crypto.Encryptor, log *zap.Logger) map[string]func() {
	return map[string]func(){
		models.JobExpiryAlerts: func() {
			notifications.RunExpiryAlerts(context.Background(), store, enc, log)
		},
		models.JobPurgeScanHistory: func() {
			days, err := store.GetScanHistoryRetentionDays(context.Background())
			if err != nil {
				log.Error("purge scan history: failed to get retention setting", zap.Error(err))
				return
			}
			deleted, err := store.PurgeScanHistory(context.Background(), days)
			if err != nil {
				log.Error("purge scan history failed", zap.Error(err))
				return
			}
			log.Info("purge scan history complete", zap.Int64("deleted", deleted), zap.Int("retention_days", days))
		},
		models.JobPurgeExpiryAlerts: func() {
			deleted, err := store.PurgeExpiryAlerts(context.Background())
			if err != nil {
				log.Error("purge expiry alerts failed", zap.Error(err))
				return
			}
			log.Info("purge expiry alerts complete", zap.Int64("deleted", deleted))
		},
		models.JobPurgeAuditLogs: func() {
			days, err := store.GetAuditLogRetentionDays(context.Background())
			if err != nil {
				log.Error("purge audit logs: failed to get retention setting", zap.Error(err))
				return
			}
			deleted, err := store.PurgeAuditLogs(context.Background(), days)
			if err != nil {
				log.Error("purge audit logs failed", zap.Error(err))
				return
			}
			log.Info("purge audit logs complete", zap.Int64("deleted", deleted), zap.Int("retention_days", days))
		},
	}
}
