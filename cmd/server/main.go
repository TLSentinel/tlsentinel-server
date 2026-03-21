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

	if err := db.RunMigrations(cfg.DBConnString, log); err != nil {
		log.Fatal("failed to run database migrations", zap.Error(err))
	}

	bunDB, err := db.NewDB(cfg.DBConnString)
	if err != nil {
		log.Fatal("failed to connect to database", zap.Error(err))
	}
	defer bunDB.Close()

	store := db.NewStore(bunDB)

	if err := auth.EnsureAdminUser(
		context.Background(),
		store,
		cfg.AdminUsername,
		cfg.AdminPassword,
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

	r, err := routes.RegisterRoutes(store, cfg)
	if err != nil {
		log.Fatal("failed to initialise routes", zap.Error(err))
	}

	srv := &http.Server{
		Addr:    cfg.Addr(),
		Handler: r,
	}

	go func() {
		log.Info("server listening", zap.String("addr", cfg.Addr()))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal("server error", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	enc := crypto.NewEncryptor(cfg.EncryptionKey)

	sched := scheduler.New()
	sched.Add("*/15 * * * *", "expiry-alerts", func() {
		notifications.RunExpiryAlerts(context.Background(), store, enc, log)
	})

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
