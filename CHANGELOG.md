# Changelog

All notable changes to the TLSentinel server are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches 1.0.

## [Unreleased]

### Added

- **CCADB-backed trust anchor tracking.** New `root_stores` and
  `root_store_anchors` tables, plus a daily refresh job that pulls CCADB's
  trust matrix (Apple, Chrome, Microsoft, Mozilla) and the matching PEM
  bundles, tagging every ingested certificate with a `trust_anchor` flag
  and per-store membership. `GET /certificates/{fingerprint}` now exposes
  `trustedBy` (root store IDs whose anchors appear anywhere in the chain)
  and `isTrustAnchor` (Subject+SKI-equivalent to a CCADB anchor). Anchor
  resolution keys on Subject DN + Subject Key ID, so cross-signed copies
  of a root (e.g. GTS Root R1 served under GlobalSign R1) resolve to the
  canonical anchor instead of walking past it. A new `GET /root-stores`
  endpoint returns the enabled-store list for the trust-matrix UI.
- **SSL Labs-style grade and score on endpoint TLS profiles.** TLS profile
  responses now include a `score` object (protocol / key-exchange / cipher
  sub-scores, weighted total, letter grade) derived from the SSL Labs SSL
  Server Rating Guide. Key-exchange strength is approximated from the
  server certificate's public key, with EC and Ed25519 mapped to NIST
  SP 800-57 RSA-equivalent sizes so the < 1024 / 2048 / 4096 thresholds
  compare apples to apples. SSL 3.0 is probed and folded into both
  classification and scoring; automatic-F and grade-cap rules follow the
  rubric as closely as the scanner's inputs allow. See `/help/scoring` for
  current coverage and limitations.
- **SAML metadata persistence with history.** Scanned SAML endpoints now
  store the parsed metadata bag alongside the raw XML (with a SHA-256
  digest), and a `saml_metadata_history` table records each distinct
  document ever observed per endpoint.
- **Universal search endpoint.** `GET /search?q=` returns up to five
  matches each across endpoints (name / DNS / URL), certificates (common
  name, SAN, fingerprint prefix), and scanners (name). Requires
  `endpoints:view`. Powers the header command-search dropdown in the UI.

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
- **`PUT /endpoints/{endpointID}/tags` now returns `200 OK` with the updated tag
  list instead of `204 No Content`.** Aligns with the PUT/PATCH convention used
  across the rest of the API and saves the frontend a follow-up `GET`. Clients
  that asserted on the 204 status must be updated; any client reading the body
  or checking for 2xx is unaffected.

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
- Trust-anchor reconciliation now matches by Subject DN + Subject Key ID
  rather than raw fingerprint. Cross-signed copies of a root (e.g. GTS Root R1
  served under a GlobalSign R1 signature) no longer get walked past as
  intermediates — the chain-of-trust viz terminates at the first
  Subject+SKI-equivalent anchor, matching how platform verifiers behave.
- CCADB fingerprints are normalized to plain lowercase hex before matching,
  in case the upstream CSV ships colon-separated or uppercase values. The
  previous direct comparison would have silently missed every anchor in
  that shape.
- Anchors that appear in CCADB's trust matrix but are missing from the
  matching per-program PEM bundle are now flagged on any certificate we
  already have locally (e.g. GlobalSign Root CA R1 is listed under
  Microsoft in the matrix but absent from Microsoft's PEM export). The
  refresh previously skipped those matrix rows entirely, so anchors we
  had already ingested from scans never got `trust_anchor=TRUE` and never
  gained store memberships. The fallback only flips existing rows — a
  matrix entry with no PEM and no local cert still logs `pem_missing`
  and is skipped, since `root_store_anchors.fingerprint` FKs
  `certificates.fingerprint`.
- The CCADB parser now matches `serverAuth` against Apple's Trust Bits
  column instead of `Websites`. Apple reports trust bits as OID-style EKU
  names (`serverAuth;clientAuth;emailProtection`), not Mozilla's
  "Websites" vocabulary, so the previous check never matched any Apple
  row — the Apple store ended up with zero anchor memberships.
- `GET /search` now returns `{"endpoints": [], "certificates": [],
  "scanners": []}` for zero-match queries instead of `null` arrays. bun's
  `Scan` leaves the destination slice nil on empty result sets, which
  crashed the frontend on its `.map(...)` calls.

### Observability

- Auth middleware now emits structured `warn` logs on 401 (missing /
  invalid bearer, invalid API key, invalid scanner token, invalid JWT) and
  on 403 (role not allowed, permission denied). Each entry carries
  `method`, `path`, `remote_addr`, a machine-readable `reason`, and — for
  403s — the authenticated `user_id` / `username` / `role` / `permission`.
- `response.JSON` now logs encode failures. Headers have already been
  flushed by the time the encoder runs, so the client still sees a
  truncated body, but operators finally get a signal when a handler
  returns an unmarshalable payload.
- Migrated logging from `go.uber.org/zap` to the stdlib `log/slog`.
  The codebase previously mixed both loggers. The switch drops two dependencies,
  yields cleaner call sites, and `TLSENTINEL_LOG_LEVEL` / `TLSENTINEL_LOG_FORMAT`
  continue to control verbosity and text-vs-JSON output as before.
- `PUT /endpoints/{id}/tags` now returns 400 when the body references an
  unknown tag id. The previous implementation relied on `ON CONFLICT DO
  NOTHING` to tolerate duplicates and inadvertently swallowed FK violations
  too, so requests that assigned nothing silently returned 204.

[Unreleased]: https://github.com/tlsentinel/tlsentinel-server/compare/main...develop
