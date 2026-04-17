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
- **`X-Forwarded-For` is no longer trusted by default.** Operators running behind
  a reverse proxy (Traefik, nginx, etc.) must set `TLSENTINEL_TRUSTED_PROXY_CIDRS`
  to the proxy's source network, otherwise audit logs will record the proxy IP
  instead of the real client. Example values:
  `127.0.0.1/32,::1/128` (sidecar), `172.16.0.0/12` (docker-compose),
  `10.0.0.0/8` (k8s). Not setting this is *safer* (spoof-proof) but changes what
  IP appears in audit entries.

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
- Bound every scheduled job invocation with a 30-minute context deadline and
  propagate the context into DB calls. A hung job previously had no upper
  bound — it could hold connections and overlap with later firings indefinitely.
- Use `fs.Stat` instead of `Open`+`Close` when probing for static assets in
  the SPA fallback. Drops the discarded `Close` error and halves the per-
  request `fs.FS` calls (`http.FileServer` still opens the file to serve it).
- Propagate errors from `crypto/rand.Read` when generating MIME boundaries
  in outgoing mail. The previous implementation discarded the error, which
  would have silently produced an all-zero boundary on RNG failure. Failures
  are near-unreachable on current Linux/macOS/Windows, but the buffer is no
  longer used when they do occur.
- Validate user email addresses and mail-config `fromAddress` / `fromName`
  at the API boundary via `net/mail.ParseAddress`, and re-check recipient,
  from address, subject, and from name inside the mailer before handing
  them to SMTP. The alert pipeline previously concatenated `user.Email`
  straight into a `To:` header, so a user who set their email to
  `victim@x.com\r\nBcc: attacker@y.com` could inject extra SMTP headers
  whenever an expiry alert fired.
- Strip CR/LF from cert-derived strings before embedding them in ICS
  `SUMMARY` / `DESCRIPTION` properties served by `/calendar/u/{token}`.
  The `golang-ical` library already escapes LF on TEXT properties, but
  bare CR slipped through; a permissive calendar client could have
  treated it as a line break and parsed forged properties out of an
  attacker-controlled Common Name.
- Gate `X-Forwarded-For` behind a trusted-proxy allowlist
  (`TLSENTINEL_TRUSTED_PROXY_CIDRS`). Previously any caller could spoof the
  audit-log source IP by supplying their own `X-Forwarded-For` header. Now
  XFF is honoured only when the TCP peer lies inside a configured CIDR;
  otherwise the audit IP falls back to the peer address.

### Fixed

- `endpoint_certs.first_seen_at` and `last_seen_at` are now set entirely by the
  database (`DEFAULT NOW()`), eliminating clock-skew drift between app and DB
  that could make the two timestamps disagree on the same upsert.
- `endpoint_tls_profiles.scanned_at` is now set entirely by the database
  (`DEFAULT NOW()` on insert, `NOW()` on conflict). Same clock-skew fix as
  `endpoint_certs`, added via migration 000039.
- The manual "look up certificate" helper (`dialAndFetchCert`) now honors
  request context cancellation for both the TCP dial and the TLS handshake.
  Cancelling the HTTP request no longer waits out the full 10-second dial
  timeout; a cancelled context also suppresses the insecure retry.

### Observability

- Auth middleware now emits structured `warn` logs on 401 (missing /
  invalid bearer, invalid API key, invalid scanner token, invalid JWT) and
  on 403 (role not allowed, permission denied). Each entry carries
  `method`, `path`, `remote_addr`, a machine-readable `reason`, and — for
  403s — the authenticated `user_id` / `username` / `role` / `permission`.
- `response.JSON` now logs encode failures via `zap.Error`. Headers have
  already been flushed by the time the encoder runs, so the client still
  sees a truncated body, but operators finally get a signal when a handler
  returns an unmarshalable payload.
- `PUT /endpoints/{id}/tags` now returns 400 when the body references an
  unknown tag id. The previous implementation relied on `ON CONFLICT DO
  NOTHING` to tolerate duplicates and inadvertently swallowed FK violations
  too, so requests that assigned nothing silently returned 204.

[Unreleased]: https://github.com/tlsentinel/tlsentinel-server/compare/main...develop
