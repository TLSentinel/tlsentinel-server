package main

import (
	"context"
	"fmt"
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

	a, err := app.New(cfg, log)
	if err != nil {
		log.Fatal("failed to initialise app", zap.Error(err))
	}

	a.Start()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("shutting down server")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := a.Shutdown(ctx); err != nil {
		log.Fatal("server forced to shutdown", zap.Error(err))
	}
	log.Info("server stopped")
}
