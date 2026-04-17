package db

import (
	"errors"

	"github.com/uptrace/bun"
)

// Store holds the bun DB handle and exposes all persistence methods.
// Each table's methods live in a dedicated <table>_store.go file.
type Store struct {
	db *bun.DB
}

func NewStore(db *bun.DB) *Store {
	return &Store{db: db}
}

// ErrNotFound is returned by Get/Delete methods when the requested record does not exist.
var ErrNotFound = errors.New("not found")

// ErrInvalidInput is returned when a caller-supplied value references records
// that do not exist (e.g. unknown host IDs passed to ReplaceGroupHosts).
var ErrInvalidInput = errors.New("invalid input")
