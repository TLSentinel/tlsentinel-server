package audit

// Entry is the payload for a single audit log write. Callers build one per
// audited operation and hand it to auth.Log, which captures the current
// identity + request context (IP, user) and persists the row.
//
// Only Action is strictly required. ResourceType / ResourceID identify the
// object the action touched — both should be set for resource-scoped actions
// (endpoint, user, scanner, …) and both left empty for global actions
// (mail config update, alert thresholds update, …).
//
// Label is a human-readable snapshot of the target (username, endpoint name,
// scanner name, cert subject CN, …). It's stored so the log stays readable
// after the resource is renamed or deleted — UUIDs alone are unreadable.
//
// Details carries structured context for the action (before/after values on
// updates, row counts on maintenance runs, …). It is marshaled to JSON by
// auth.Log and stored in the details JSONB column. Nil details are stored
// as NULL. Any value that encoding/json can handle is accepted; use a map
// or a typed struct with json tags.
type Entry struct {
	Action       string
	ResourceType string
	ResourceID   string
	Label        string
	Details      any
}
