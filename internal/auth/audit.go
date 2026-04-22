package auth

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/pkg/ptr"
)

// Log records an audit event for the authenticated identity in ctx.
// Empty ResourceType / ResourceID / Label are stored as NULL so settings-style
// global actions can leave them unset. A nil Details is also stored as NULL;
// a non-nil Details that fails to marshal falls back to NULL with a warning
// so the audit row still lands.
func Log(ctx context.Context, store *db.Store, r *http.Request, e audit.Entry) {
	identity, _ := GetIdentity(ctx)
	ip := audit.IPFromRequest(r)
	row := db.AuditLog{
		UserID:    ptr.IfNonEmpty(identity.UserID),
		Username:  identity.Username,
		Action:    e.Action,
		IPAddress: &ip,
	}
	applyEntry(&row, e)
	writeRow(ctx, store, row, e.Action)
}

// SystemUsername is the username attributed to audit rows emitted by
// internal triggers (cron, startup tasks, etc.) that have no HTTP identity.
const SystemUsername = "system"

// LogSystem records an audit event with no authenticated user — used for
// scheduler-triggered jobs and other internal triggers. The row is stamped
// with username=system and no IP address.
func LogSystem(ctx context.Context, store *db.Store, e audit.Entry) {
	row := db.AuditLog{
		Username: SystemUsername,
		Action:   e.Action,
	}
	applyEntry(&row, e)
	writeRow(ctx, store, row, e.Action)
}

// applyEntry folds the optional Entry fields into an AuditLog row.
func applyEntry(row *db.AuditLog, e audit.Entry) {
	if e.ResourceType != "" {
		row.ResourceType = &e.ResourceType
	}
	if e.ResourceID != "" {
		row.ResourceID = &e.ResourceID
	}
	if e.Label != "" {
		row.ResourceLabel = &e.Label
	}
	if e.Details != nil {
		raw, err := json.Marshal(e.Details)
		if err != nil {
			slog.Warn("audit details marshal failed", "action", e.Action, "error", err)
		} else {
			row.Details = raw
		}
	}
}

func writeRow(ctx context.Context, store *db.Store, row db.AuditLog, action string) {
	if err := store.LogAuditEvent(ctx, row); err != nil {
		slog.Error("audit log failed", "action", action, "error", err)
	}
}
