// Package logger provides the application-wide slog.Logger and a chi request
// logging middleware.
//
// Call [Build] once in main, then [slog.SetDefault] so every package can
// reach the logger via [slog.Default] or the top-level [slog.Info] /
// [slog.Warn] / [slog.Error] helpers without import cycles.
//
// Configuration (environment variables):
//
//	TLSENTINEL_LOG_LEVEL   debug | info | warn | error  (default: info)
//	TLSENTINEL_LOG_FORMAT  json  | text | auto          (default: auto)
//
// In "auto" mode the format is "text" (human-readable) when stdout is
// attached to a terminal, and "json" otherwise (Docker / production).
package logger

import (
	"log/slog"
	"os"
	"strings"
)

// Build constructs a *slog.Logger from the TLSENTINEL_LOG_* environment
// variables. The caller is responsible for installing it with
// slog.SetDefault.
func Build() (*slog.Logger, error) {
	level := parseLevel(os.Getenv("TLSENTINEL_LOG_LEVEL"))
	useJSON := resolveFormat(os.Getenv("TLSENTINEL_LOG_FORMAT"))

	opts := &slog.HandlerOptions{Level: level}
	var h slog.Handler
	if useJSON {
		h = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		h = slog.NewTextHandler(os.Stdout, opts)
	}
	return slog.New(h), nil
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// resolveFormat returns true for JSON, false for text.
func resolveFormat(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "json":
		return true
	case "text":
		return false
	default: // "auto" or unset — JSON unless stdout is a terminal
		return !isTerminal(os.Stdout)
	}
}

func isTerminal(f *os.File) bool {
	stat, err := f.Stat()
	if err != nil {
		return false
	}
	return (stat.Mode() & os.ModeCharDevice) != 0
}
