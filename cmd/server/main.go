package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/tlsentinel/tlsentinel-server/docs"
	"github.com/tlsentinel/tlsentinel-server/internal/app"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/logger"
	"github.com/tlsentinel/tlsentinel-server/internal/version"

	"github.com/joho/godotenv"
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
	slog.SetDefault(log)

	log.Info("starting",
		"version", version.Version,
		"commit", version.Commit,
		"built", version.BuildTime,
	)

	a, err := app.New(cfg, log)
	if err != nil {
		log.Error("failed to initialise app", "error", err)
		os.Exit(1)
	}

	a.Start()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("shutting down server")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := a.Shutdown(ctx); err != nil {
		log.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}
	log.Info("server stopped")
}
