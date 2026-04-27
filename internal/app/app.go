package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/routes"
	"github.com/tlsentinel/tlsentinel-server/internal/scheduler"
	"github.com/tlsentinel/tlsentinel-server/internal/trust"
	"github.com/uptrace/bun"
)

// App holds every long-lived dependency for the server process.
// Create it with New, start it with Start, and tear it down with Shutdown.
type App struct {
	Config    *config.Config
	Logger    *slog.Logger
	Store     *db.Store
	Scheduler *scheduler.Scheduler
	Server    *http.Server

	bunDB       *bun.DB
	schedCancel context.CancelFunc
}

// New initialises the full dependency graph: migrations, database, store,
// admin bootstrap, one-time backfills, job registry, scheduler, and HTTP
// server. It does not start any goroutines — call Start for that.
func New(cfg *config.Config, log *slog.Logger) (*App, error) {
	proxies, err := cfg.ParseTrustedProxies()
	if err != nil {
		return nil, fmt.Errorf("trusted proxies: %w", err)
	}
	audit.SetTrustedProxies(proxies)
	if len(proxies) > 0 {
		log.Info("trusted proxies configured", "count", len(proxies))
	} else {
		log.Info("no trusted proxies — X-Forwarded-For will be ignored")
	}

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
		log.Warn("dn hash backfill failed", "error", err)
	} else if n > 0 {
		log.Info("backfilled dn hashes", "count", n)
	}

	if n, err := store.ReconcileCertificateChains(context.Background()); err != nil {
		log.Warn("certificate chain reconciliation failed", "error", err)
	} else if n > 0 {
		log.Info("reconciled certificate chain links", "count", n)
	}

	if n, err := store.BackfillSubjectOrgOU(context.Background()); err != nil {
		log.Warn("subject org/ou backfill failed", "error", err)
	} else if n > 0 {
		log.Info("backfilled subject org/ou", "count", n)
	}

	enc := crypto.NewEncryptor(cfg.EncryptionKey)

	// Trust evaluator: in-process x509.Verify() path that replaces the
	// old recursive-CTE name-match. Built once, shared across every probe
	// ingest and every root-store refresh. We block on the initial pool
	// load so that by the time the HTTP listener opens, /certificates/*
	// trust columns already have a valid evaluator behind them. A failure
	// here is non-fatal — the server keeps running with an empty
	// evaluator; verdicts will simply be "not trusted" until the next
	// refresh succeeds.
	trustEv := trust.New(log)
	if err := trustEv.LoadPools(context.Background(), store); err != nil {
		log.Warn("initial trust pool load failed, continuing with empty pools", "error", err)
	}

	registry := buildJobRegistry(store, enc, log, trustEv)
	sched := scheduler.New(registry)
	loadScheduledJobs(context.Background(), store, sched, registry, log)

	r, err := routes.RegisterRoutes(store, cfg, sched, trustEv)
	if err != nil {
		return nil, fmt.Errorf("routes: %w", err)
	}

	// Backfill certificate_trust in the background. On first boot after
	// the 000046 migration the table is empty; this walks every leaf and
	// fills in verdicts without blocking startup. Subsequent boots see
	// little to do since probe ingest keeps the table current.
	go func() {
		if err := trustEv.ReevaluateAll(context.Background(), store); err != nil {
			log.Warn("startup trust reevaluation failed", "error", err)
		}
	}()

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
		a.Logger.Info("server listening", "addr", a.Config.ListenAddr())
		if err := a.Server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			a.Logger.Error("server error", "error", err)
			os.Exit(1)
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
