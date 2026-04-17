# Changelog

All notable changes to the TLSentinel server are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches 1.0.

## [Unreleased]

### Breaking Changes

- **`TLSENTINEL_JWT_SECRET` must now be base64-encoded and decode to at least 32 bytes.**
  Plaintext values are rejected at boot. Regenerate with `openssl rand -base64 32`.
  All currently issued JWTs are invalidated by the key change — users must log in
  again after deployment.
- **Legacy `scanner_`-prefixed scanner tokens are no longer accepted.** Any remaining
  legacy tokens must be rotated via Settings → Scanners before upgrading. All new
  tokens use the `stx_s_` prefix with SHA-256 hashing.

### Security

- Set read, write, and idle timeouts on the HTTP server to protect against
  slowloris-style connection exhaustion.
- Cap request body size at 10 MiB via a global middleware to prevent memory
  exhaustion from oversized or unbounded uploads.
- Remove the O(n) bcrypt fallback for legacy scanner token authentication — the
  per-request cost scaled with scanner count and leaked that count via response-time
  timing.
- Require `TLSENTINEL_JWT_SECRET` to decode from base64 to at least 32 bytes
  (256 bits). The previous floor of 32 ASCII characters accepted weak passphrases.
- Decouple the stored API key display prefix from secret bytes. The prefix was
  previously the first 6 hex chars of the key material; newly issued keys
  embed an independent 8-hex-char identifier so a DB read leaks zero bits of
  the secret. Existing keys keep their original prefixes unchanged.
- Add a dedicated `apikeys:admin` permission for cross-user API key management.
  The `/admin/api-keys` list and revoke routes were previously gated by
  `users:view` / `users:edit`, which let operators enumerate and revoke every
  user's API keys. Only the admin role carries the new permission.

### Fixed

- `endpoint_certs.first_seen_at` and `last_seen_at` are now set entirely by the
  database (`DEFAULT NOW()`), eliminating clock-skew drift between app and DB
  that could make the two timestamps disagree on the same upsert.

[Unreleased]: https://github.com/tlsentinel/tlsentinel-server/compare/main...develop
