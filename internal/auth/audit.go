package auth

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/pkg/ptr"
)

// LogAction records an audit event for the authenticated identity in ctx.
// Empty resourceType or resourceID are stored as NULL so settings-style
// global actions can pass "".
func LogAction(ctx context.Context, store *db.Store, r *http.Request, action, resourceType, resourceID string) {
	identity, _ := GetIdentity(ctx)
	ip := audit.IPFromRequest(r)
	entry := db.AuditLog{
		UserID:    ptr.IfNonEmpty(identity.UserID),
		Username:  identity.Username,
		Action:    action,
		IPAddress: &ip,
	}
	if resourceType != "" {
		entry.ResourceType = &resourceType
	}
	if resourceID != "" {
		entry.ResourceID = &resourceID
	}
	if err := store.LogAuditEvent(ctx, entry); err != nil {
		slog.Error("audit log failed", "error", err)
	}
}
