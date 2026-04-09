package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/tlsentinel/tlsentinel-server/docs"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/logger"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/notifications"
	"github.com/tlsentinel/tlsentinel-server/internal/routes"
	"github.com/tlsentinel/tlsentinel-server/internal/scheduler"
	"github.com/tlsentinel/tlsentinel-server/internal/version"

	"github.com/joho/godotenv"
	"go.uber.org/zap"
)

// @title           TLSentinel API
// @version         1.0
// @description     API for monitoring and managing X.509 certificates.

// @host      localhost:8080
// @BasePath  /api/v1
func main() {
	_ = godotenv.Load()

	cfg, err := config.LoadConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config error: %v\n", err)
		os.Exit(1)
	}

	log, err := logger.Build()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to initialise logger: %v\n", err)
		os.Exit(1)
	}
	zap.ReplaceGlobals(log)
	defer log.Sync() //nolint:errcheck

	log.Info("starting",
		zap.String("version", version.Version),
		zap.String("commit", version.Commit),
		zap.String("built", version.BuildTime),
	)

	if err := db.RunMigrations(cfg, log); err != nil {
		log.Fatal("failed to run database migrations", zap.Error(err))
	}

	bunDB, err := db.NewDB(cfg)
	if err != nil {
		log.Fatal("failed to connect to database", zap.Error(err))
	}
	defer bunDB.Close()

	store := db.NewStore(bunDB)

	if err := auth.EnsureAdminUser(
		context.Background(),
		store,
		cfg,
	); err != nil {
		log.Fatal("bootstrap failed", zap.Error(err))
	}

	// Backfill subject_dn_hash / issuer_dn_hash for certs inserted before migration 000012.
	// No-op once all rows are populated. Can be removed after sufficient time has passed.
	if n, err := store.BackfillDNHashes(context.Background()); err != nil {
		log.Warn("dn hash backfill failed", zap.Error(err))
	} else if n > 0 {
		log.Info("backfilled dn hashes", zap.Int64("count", n))
	}

	n, err := store.ReconcileCertificateChains(context.Background())
	if err != nil {
		log.Warn("certificate chain reconciliation failed", zap.Error(err))
	} else if n > 0 {
		log.Info("reconciled certificate chain links", zap.Int64("count", n))
	}

	enc := crypto.NewEncryptor(cfg.EncryptionKey)

	// Build the registry of known job names → functions.
	// The scheduler holds this registry so it can hot-reload jobs without main.go involvement.
	jobRegistry := map[string]func(){
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
	}

	sched := scheduler.New(jobRegistry)
	if dbJobs, err := store.ListScheduledJobs(context.Background()); err != nil {
		log.Warn("failed to load scheduled jobs from DB, scheduler not started", zap.Error(err))
	} else {
		for _, job := range dbJobs {
			if !job.Enabled {
				log.Info("job disabled, skipping", zap.String("job", job.Name))
				continue
			}
			fn, ok := jobRegistry[job.Name]
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

	r, err := routes.RegisterRoutes(store, cfg, sched)
	if err != nil {
		log.Fatal("failed to initialise routes", zap.Error(err))
	}

	srv := &http.Server{
		Addr:    cfg.ListenAddr(),
		Handler: r,
	}

	go func() {
		log.Info("server listening", zap.String("addr", cfg.ListenAddr()))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal("server error", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	schedCtx, schedCancel := context.WithCancel(context.Background())
	defer schedCancel()
	sched.Start(schedCtx)

	<-quit
	schedCancel() // stop scheduler before HTTP shutdown

	log.Info("shutting down server")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("server forced to shutdown", zap.Error(err))
	}
	log.Info("server stopped")
}
