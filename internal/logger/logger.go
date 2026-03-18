// Package logger provides the application-wide zap logger and a chi request
// logging middleware.
//
// Call [Build] once in main, then [zap.ReplaceGlobals] so every package can
// reach the logger via [zap.L] (typed) or [zap.S] (sugared) without import
// cycles.
//
// Configuration (environment variables):
//
//	TLSENTINEL_LOG_LEVEL   debug | info | warn | error  (default: info)
//	TLSENTINEL_LOG_FORMAT  json  | text | auto          (default: auto)
//
// In "auto" mode the format is "text" (human-readable, coloured) when stdout
// is attached to a terminal, and "json" otherwise (Docker / production).
package logger

import (
	"os"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Build constructs a zap.Logger from the TLSENTINEL_LOG_* environment
// variables.  The caller is responsible for calling zap.ReplaceGlobals and
// defer logger.Sync().
func Build() (*zap.Logger, error) {
	level := parseLevel(os.Getenv("TLSENTINEL_LOG_LEVEL"))
	useJSON := resolveFormat(os.Getenv("TLSENTINEL_LOG_FORMAT"))

	encCfg := zap.NewProductionEncoderConfig()
	encCfg.TimeKey = "time"
	encCfg.EncodeTime = zapcore.ISO8601TimeEncoder

	var enc zapcore.Encoder
	if useJSON {
		encCfg.EncodeLevel = zapcore.LowercaseLevelEncoder
		enc = zapcore.NewJSONEncoder(encCfg)
	} else {
		encCfg.EncodeLevel = zapcore.CapitalColorLevelEncoder
		enc = zapcore.NewConsoleEncoder(encCfg)
	}

	core := zapcore.NewCore(enc, zapcore.AddSync(os.Stdout), level)
	return zap.New(core, zap.AddCaller(), zap.AddStacktrace(zapcore.ErrorLevel)), nil
}

func parseLevel(s string) zapcore.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return zapcore.DebugLevel
	case "warn", "warning":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	default:
		return zapcore.InfoLevel
	}
}

// resolveFormat returns true for JSON, false for console text.
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
