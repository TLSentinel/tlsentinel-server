// Package ptr provides small pointer-conversion helpers.
package ptr

// IfNonEmpty returns a pointer to s, or nil if s is empty.
// Useful for mapping form fields to optional DB columns.
func IfNonEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
