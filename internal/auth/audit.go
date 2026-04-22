package auth

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/pkg/ptr"
)

// Log records an audit event for the authenticated identity in ctx.
// Empty ResourceType or ResourceID are stored as NULL so settings-style
// global actions can leave them unset.
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
	if err := store.LogAuditEvent(ctx, row); err != nil {
		slog.Error("audit log failed", "error", err)
	}
}
