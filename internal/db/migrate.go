package db

import (
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/migrations"
	"go.uber.org/zap"
)

type migrateLogger struct {
	logger *zap.Logger
}

func (l *migrateLogger) Printf(format string, v ...interface{}) {
	l.logger.Sugar().Infof(strings.TrimRight(fmt.Sprintf(format, v...), "\n"))
}

func (l *migrateLogger) Verbose() bool {
	return true
}

func RunMigrations(cfg *config.Config, logger *zap.Logger) error {
	logger.Info("running database migrations", zap.String("source", "embedded"))
	d, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return err
	}
	m, err := migrate.NewWithSourceInstance("iofs", d, cfg.DBConnString())
	if err != nil {
		return err
	}
	defer m.Close()
	m.Log = &migrateLogger{logger: logger}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return err
	}
	return nil
}
