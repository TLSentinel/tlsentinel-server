package db

import (
	"database/sql"
	"fmt"
	"log/slog"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	migratepg "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/lib/pq"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/migrations"
)

type migrateLogger struct {
	logger *slog.Logger
}

func (l *migrateLogger) Printf(format string, v ...interface{}) {
	l.logger.Info(strings.TrimRight(fmt.Sprintf(format, v...), "\n"))
}

func (l *migrateLogger) Verbose() bool {
	return true
}

func RunMigrations(cfg *config.Config, logger *slog.Logger) error {
	// Ensure the tlsentinel schema exists before golang-migrate runs.
	// This must happen first so migration 1 (which is now a no-op) doesn't
	// race with schema_migrations table creation in the public schema.
	sqlDB, err := sql.Open("postgres", cfg.DBConnString())
	if err != nil {
		return fmt.Errorf("failed to open db for schema bootstrap: %w", err)
	}
	if _, err := sqlDB.Exec("CREATE SCHEMA IF NOT EXISTS tlsentinel"); err != nil {
		sqlDB.Close()
		return fmt.Errorf("failed to create tlsentinel schema: %w", err)
	}
	sqlDB.Close()

	logger.Info("running database migrations", "source", "embedded")

	d, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return err
	}

	migrateDB, err := sql.Open("postgres", cfg.DBConnString())
	if err != nil {
		return fmt.Errorf("failed to open db for migrations: %w", err)
	}
	defer migrateDB.Close()

	driver, err := migratepg.WithInstance(migrateDB, &migratepg.Config{
		MigrationsTable: "schema_migrations",
		SchemaName:      "tlsentinel",
	})
	if err != nil {
		return fmt.Errorf("failed to create migration driver: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", d, "postgres", driver)
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
