package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/tlsentinel/tlsentinel-server/docs"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/routes"
	"github.com/tlsentinel/tlsentinel-server/internal/scheduler"
	"github.com/tlsentinel/tlsentinel-server/internal/version"

	"github.com/joho/godotenv"
)

// @title           TLSentinel API
// @version         1.0
// @description     API for monitoring and managing X.509 certificates.

// @host      localhost:8080
// @BasePath  /api/v1
func main() {
	log.Printf("TLSentinel %s (commit %s, built %s)", version.Version, version.Commit, version.BuildTime)

	_ = godotenv.Load()

	connString, err := dbConnString()
	if err != nil {
		log.Fatalf("database configuration: %v", err)
	}

	jwtSecret := os.Getenv("TLSENTINEL_JWT_SECRET")
	if len(jwtSecret) < 32 {
		log.Fatal("TLSENTINEL_JWT_SECRET must be at least 32 characters")
	}

	bunDB, err := db.NewDB(connString)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer bunDB.Close()

	store := db.NewStore(bunDB)

	if err := auth.EnsureAdminUser(
		context.Background(),
		store,
		os.Getenv("TLSENTINEL_ADMIN_USERNAME"),
		os.Getenv("TLSENTINEL_ADMIN_PASSWORD"),
	); err != nil {
		log.Fatalf("bootstrap failed: %v", err)
	}

	n, err := store.ReconcileCertificateChains(context.Background())
	if err != nil {
		log.Printf("warning: certificate chain reconciliation failed: %v", err)
	} else if n > 0 {
		log.Printf("reconciled %d certificate chain link(s)", n)
	}

	jwtCfg := &auth.JWTConfig{
		SecretKey: []byte(jwtSecret),
		TTL:       24 * time.Hour,
	}

	// Encryption key is optional — if absent, SMTP passwords cannot be stored.
	encryptionKey, keyErr := crypto.LoadEncryptionKey()
	if keyErr != nil {
		log.Printf("warning: %v — SMTP authentication with passwords will be unavailable", keyErr)
	}

	sched := scheduler.New()
	// Jobs are registered here as they are implemented — none yet.

	r := routes.RegisterRoutes(store, jwtCfg, encryptionKey)

	srv := &http.Server{
		Addr:    ":8080",
		Handler: r,
	}

	go func() {
		log.Println("server running on :8080")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	schedCtx, schedCancel := context.WithCancel(context.Background())
	defer schedCancel()
	sched.Start(schedCtx)

	<-quit
	schedCancel() // stop scheduler before HTTP shutdown

	log.Println("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}
	log.Println("server stopped")
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
