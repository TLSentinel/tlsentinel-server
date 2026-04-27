package app

import (
	"context"
	"log/slog"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/notifications"
	"github.com/tlsentinel/tlsentinel-server/internal/rootstore"
	"github.com/tlsentinel/tlsentinel-server/internal/scheduler"
	"github.com/tlsentinel/tlsentinel-server/internal/trust"
)

// scheduledTrigger tags audit rows emitted by the cron-driven path so they
// can be distinguished from manual "Run Now" entries without relying on the
// username column.
const scheduledTrigger = "scheduled"

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

func buildJobRegistry(store *db.Store, enc *crypto.Encryptor, log *slog.Logger, trustEv *trust.Evaluator) map[string]func(context.Context) {
	return map[string]func(context.Context){
		models.JobExpiryAlerts: func(ctx context.Context) {
			// RunExpiryAlerts logs its own progress and doesn't surface counts yet.
			// For now we just record "it ran" so the audit log shows the cron fired.
			notifications.RunExpiryAlerts(ctx, store, enc, log)
			auth.LogSystem(ctx, store, audit.Entry{
				Action:  audit.MaintenanceExpiryAlerts,
				Details: map[string]any{"trigger": scheduledTrigger},
			})
		},
		models.JobPurgeScanHistory: func(ctx context.Context) {
			days, err := store.GetScanHistoryRetentionDays(ctx)
			if err != nil {
				log.Error("purge scan history: failed to get retention setting", "error", err)
				auth.LogSystem(ctx, store, audit.Entry{
					Action:  audit.MaintenancePurgeScanHistory,
					Details: map[string]any{"trigger": scheduledTrigger, "error": err.Error()},
				})
				return
			}
			deleted, err := store.PurgeScanHistory(ctx, days)
			if err != nil {
				log.Error("purge scan history failed", "error", err)
				auth.LogSystem(ctx, store, audit.Entry{
					Action:  audit.MaintenancePurgeScanHistory,
					Details: map[string]any{"trigger": scheduledTrigger, "retentionDays": days, "error": err.Error()},
				})
				return
			}
			log.Info("purge scan history complete", "deleted", deleted, "retention_days", days)
			auth.LogSystem(ctx, store, audit.Entry{
				Action:  audit.MaintenancePurgeScanHistory,
				Details: map[string]any{"trigger": scheduledTrigger, "deleted": deleted, "retentionDays": days},
			})
		},
		models.JobPurgeExpiryAlerts: func(ctx context.Context) {
			deleted, err := store.PurgeExpiryAlerts(ctx)
			if err != nil {
				log.Error("purge expiry alerts failed", "error", err)
				auth.LogSystem(ctx, store, audit.Entry{
					Action:  audit.MaintenancePurgeExpiryAlerts,
					Details: map[string]any{"trigger": scheduledTrigger, "error": err.Error()},
				})
				return
			}
			log.Info("purge expiry alerts complete", "deleted", deleted)
			auth.LogSystem(ctx, store, audit.Entry{
				Action:  audit.MaintenancePurgeExpiryAlerts,
				Details: map[string]any{"trigger": scheduledTrigger, "deleted": deleted},
			})
		},
		models.JobPurgeUnreferencedCerts: func(ctx context.Context) {
			purged, err := store.PurgeUnreferencedCerts(ctx)
			if err != nil {
				log.Error("purge unreferenced certs failed", "error", err)
				auth.LogSystem(ctx, store, audit.Entry{
					Action:  audit.MaintenancePurgeUnreferencedCerts,
					Details: map[string]any{"trigger": scheduledTrigger, "error": err.Error()},
				})
				return
			}
			log.Info("purge unreferenced certs complete", "deleted", len(purged))
			auth.LogSystem(ctx, store, audit.Entry{
				Action:  audit.MaintenancePurgeUnreferencedCerts,
				Details: audit.PurgedCertsDetails(scheduledTrigger, purged),
			})
		},
		models.JobRefreshRootStores: func(ctx context.Context) {
			if err := rootstore.Refresh(ctx, store, log); err != nil {
				log.Error("refresh root stores failed", "error", err)
				auth.LogSystem(ctx, store, audit.Entry{
					Action:  audit.MaintenanceRefreshRootStores,
					Details: map[string]any{"trigger": scheduledTrigger, "error": err.Error()},
				})
				return
			}
			// A refreshed anchor set can flip every existing verdict. Rebuild
			// the in-memory pools and re-evaluate every leaf so
			// certificate_trust reflects the new matrix before the audit log
			// says we're done.
			if err := trustEv.LoadPools(ctx, store); err != nil {
				log.Warn("refresh root stores: pool reload failed", "error", err)
			} else if err := trustEv.ReevaluateAll(ctx, store); err != nil {
				log.Warn("refresh root stores: reevaluation failed", "error", err)
			}
			log.Info("refresh root stores complete")
			auth.LogSystem(ctx, store, audit.Entry{
				Action:  audit.MaintenanceRefreshRootStores,
				Details: map[string]any{"trigger": scheduledTrigger},
			})
		},
		models.JobPurgeAuditLogs: func(ctx context.Context) {
			days, err := store.GetAuditLogRetentionDays(ctx)
			if err != nil {
				log.Error("purge audit logs: failed to get retention setting", "error", err)
				auth.LogSystem(ctx, store, audit.Entry{
					Action:  audit.MaintenancePurgeAuditLogs,
					Details: map[string]any{"trigger": scheduledTrigger, "error": err.Error()},
				})
				return
			}
			deleted, err := store.PurgeAuditLogs(ctx, days)
			if err != nil {
				log.Error("purge audit logs failed", "error", err)
				auth.LogSystem(ctx, store, audit.Entry{
					Action:  audit.MaintenancePurgeAuditLogs,
					Details: map[string]any{"trigger": scheduledTrigger, "retentionDays": days, "error": err.Error()},
				})
				return
			}
			log.Info("purge audit logs complete", "deleted", deleted, "retention_days", days)
			auth.LogSystem(ctx, store, audit.Entry{
				Action:  audit.MaintenancePurgeAuditLogs,
				Details: map[string]any{"trigger": scheduledTrigger, "deleted": deleted, "retentionDays": days},
			})
		},
	}
}
