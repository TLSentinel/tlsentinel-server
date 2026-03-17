package db

import (
	"database/sql"
	"fmt"

	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"github.com/uptrace/bun/driver/pgdriver"
)

func NewDB(connString string) (*bun.DB, error) {
	sqldb := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(connString)))

	if err := sqldb.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return bun.NewDB(sqldb, pgdialect.New()), nil
}
