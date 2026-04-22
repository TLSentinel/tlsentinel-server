package audit

// Entry is the payload for a single audit log write. Callers build one per
// audited operation and hand it to auth.Log, which captures the current
// identity + request context (IP, user) and persists the row.
//
// Only Action is strictly required. ResourceType / ResourceID identify the
// object the action touched — both should be set for resource-scoped actions
// (endpoint, user, scanner, …) and both left empty for global actions
// (mail config update, alert thresholds update, …).
type Entry struct {
	Action       string
	ResourceType string
	ResourceID   string
}
