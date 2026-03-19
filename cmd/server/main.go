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
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/logger"
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
	// Load .env before anything else so TLSENTINEL_LOG_* vars are available.
	_ = godotenv.Load()

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

	connString, err := dbConnString()
	if err != nil {
		log.Fatal("database configuration", zap.Error(err))
	}

	jwtSecret := os.Getenv("TLSENTINEL_JWT_SECRET")
	if len(jwtSecret) < 32 {
		log.Fatal("TLSENTINEL_JWT_SECRET must be at least 32 characters")
	}

	bunDB, err := db.NewDB(connString)
	if err != nil {
		log.Fatal("failed to connect to database", zap.Error(err))
	}
	defer bunDB.Close()

	store := db.NewStore(bunDB)

	if err := auth.EnsureAdminUser(
		context.Background(),
		store,
		os.Getenv("TLSENTINEL_ADMIN_USERNAME"),
		os.Getenv("TLSENTINEL_ADMIN_PASSWORD"),
	); err != nil {
		log.Fatal("bootstrap failed", zap.Error(err))
	}

	n, err := store.ReconcileCertificateChains(context.Background())
	if err != nil {
		log.Warn("certificate chain reconciliation failed", zap.Error(err))
	} else if n > 0 {
		log.Info("reconciled certificate chain links", zap.Int64("count", n))
	}

	jwtCfg := &auth.JWTConfig{
		SecretKey: []byte(jwtSecret),
		TTL:       24 * time.Hour,
	}

	sched := scheduler.New()
	// Jobs are registered here as they are implemented — none yet.

	r, err := routes.RegisterRoutes(store, jwtCfg)
	if err != nil {
		log.Fatal("failed to initialise routes", zap.Error(err))
	}

	srv := &http.Server{
		Addr:    ":8080",
		Handler: r,
	}

	go func() {
		log.Info("server listening", zap.String("addr", ":8080"))
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

// dbConnString returns the Postgres connection string.
// It prefers TLSENTINEL_DATABASE_URL; if absent it assembles a URL from
// TLSENTINEL_DB_HOST, TLSENTINEL_DB_USER, TLSENTINEL_DB_PASSWORD,
// TLSENTINEL_DB_NAME, and optionally TLSENTINEL_DB_PORT (default 5432)
// and TLSENTINEL_DB_SSLMODE (default require).
func dbConnString() (string, error) {
	if url := os.Getenv("TLSENTINEL_DATABASE_URL"); url != "" {
		return url, nil
	}

	host := os.Getenv("TLSENTINEL_DB_HOST")
	username := os.Getenv("TLSENTINEL_DB_USERNAME")
	password := os.Getenv("TLSENTINEL_DB_PASSWORD")
	name := os.Getenv("TLSENTINEL_DB_NAME")

	if host == "" || username == "" || password == "" || name == "" {
		return "", fmt.Errorf(
			"set TLSENTINEL_DATABASE_URL, or provide TLSENTINEL_DB_HOST, " +
				"TLSENTINEL_DB_USER, TLSENTINEL_DB_PASSWORD, and TLSENTINEL_DB_NAME",
		)
	}

	port := os.Getenv("TLSENTINEL_DB_PORT")
	if port == "" {
		port = "5432"
	}

	sslmode := os.Getenv("TLSENTINEL_DB_SSLMODE")
	if sslmode == "" {
		sslmode = "require"
	}

	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		username, password, host, port, name, sslmode,
	), nil
}
