package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/routes"
	"github.com/tlsentinel/tlsentinel-server/internal/scheduler"
	"github.com/uptrace/bun"
	"go.uber.org/zap"
)

// App holds every long-lived dependency for the server process.
// Create it with New, start it with Start, and tear it down with Shutdown.
type App struct {
	Config    *config.Config
	Logger    *zap.Logger
	Store     *db.Store
	Scheduler *scheduler.Scheduler
	Server    *http.Server

	bunDB       *bun.DB
	schedCancel context.CancelFunc
}

// New initialises the full dependency graph: migrations, database, store,
// admin bootstrap, one-time backfills, job registry, scheduler, and HTTP
// server. It does not start any goroutines — call Start for that.
func New(cfg *config.Config, log *zap.Logger) (*App, error) {
	if err := db.RunMigrations(cfg, log); err != nil {
		return nil, fmt.Errorf("migrations: %w", err)
	}

	bunDB, err := db.NewDB(cfg)
	if err != nil {
		return nil, fmt.Errorf("database: %w", err)
	}

	store := db.NewStore(bunDB)

	if err := auth.EnsureAdminUser(context.Background(), store, cfg); err != nil {
		return nil, fmt.Errorf("bootstrap: %w", err)
	}

	// One-time backfills — no-ops once all rows are populated.
	if n, err := store.BackfillDNHashes(context.Background()); err != nil {
		log.Warn("dn hash backfill failed", zap.Error(err))
	} else if n > 0 {
		log.Info("backfilled dn hashes", zap.Int64("count", n))
	}

	if n, err := store.ReconcileCertificateChains(context.Background()); err != nil {
		log.Warn("certificate chain reconciliation failed", zap.Error(err))
	} else if n > 0 {
		log.Info("reconciled certificate chain links", zap.Int64("count", n))
	}

	enc := crypto.NewEncryptor(cfg.EncryptionKey)

	registry := buildJobRegistry(store, enc, log)
	sched := scheduler.New(registry)
	loadScheduledJobs(context.Background(), store, sched, registry, log)

	r, err := routes.RegisterRoutes(store, cfg, sched)
	if err != nil {
		return nil, fmt.Errorf("routes: %w", err)
	}

	srv := &http.Server{
		Addr:              cfg.ListenAddr(),
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	return &App{
		Config:    cfg,
		Logger:    log,
		Store:     store,
		Scheduler: sched,
		Server:    srv,
		bunDB:     bunDB,
	}, nil
}

// Start launches the scheduler and HTTP server in background goroutines.
// It returns immediately. Call Shutdown to stop them gracefully.
func (a *App) Start() {
	schedCtx, cancel := context.WithCancel(context.Background())
	a.schedCancel = cancel
	a.Scheduler.Start(schedCtx)

	go func() {
		a.Logger.Info("server listening", zap.String("addr", a.Config.ListenAddr()))
		if err := a.Server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			a.Logger.Fatal("server error", zap.Error(err))
		}
	}()
}

// Shutdown stops the scheduler, drains in-flight HTTP requests within the
// deadline of ctx, and closes the database connection.
func (a *App) Shutdown(ctx context.Context) error {
	if a.schedCancel != nil {
		a.schedCancel()
	}
	err := a.Server.Shutdown(ctx)
	a.bunDB.Close()
	return err
}
