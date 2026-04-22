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
	if err := store.LogAuditEvent(ctx, row); err != nil {
		slog.Error("audit log failed", "error", err)
	}
}
