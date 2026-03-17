package auth

import "context"

// IdentityKind distinguishes user vs scanner principals.
type IdentityKind string

const (
	KindUser    IdentityKind = "user"
	KindScanner IdentityKind = "scanner"
)

// Identity is attached to the request context by the Authenticate middleware.
type Identity struct {
	Kind      IdentityKind
	UserID    string // set when Kind == KindUser
	Username  string // set when Kind == KindUser
	Role      string // set when Kind == KindUser
	ScannerID string // set when Kind == KindScanner
}

// contextKey is unexported to prevent collisions with other packages.
type contextKey struct{}

// SetIdentity returns a new context with the Identity attached.
func SetIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, contextKey{}, id)
}

// GetIdentity retrieves the Identity from the context.
// Returns false if no identity has been set.
func GetIdentity(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(contextKey{}).(Identity)
	return id, ok
}
