// Package version holds build-time metadata injected via -ldflags.
// The defaults ("dev", "unknown", "unknown") are used when running
// with `go run` without explicit flags.
package version

var (
	// Version is the semver tag (e.g. "v1.2.3") or a git-describe string.
	Version = "dev"
	// Commit is the short git SHA of the build.
	Commit = "unknown"
	// BuildTime is the UTC timestamp when the binary was compiled.
	BuildTime = "unknown"
)
