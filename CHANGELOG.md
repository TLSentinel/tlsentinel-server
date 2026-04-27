# Changelog

## [v2026.5]

### Added

- **Universal search now matches IP addresses.** The header search box (Cmd/Ctrl+K)
  recognises IPv4 and IPv6 fragments and switches to exact + prefix matching
  across three IP-bearing endpoint columns: the operator-typed `dns_name`
  (which may itself be an IP literal), the `ip_address` override, and a new
  scanner-written `last_resolved_ip`. Typing `10.0.5` finds every host
  starting with `10.0.5.`; typing `10.0.5.7` matches that exact host. Text
  queries (hostnames, names, SAML URLs) keep the existing ILIKE substring
  semantics. The new `last_resolved_ip` column on `endpoint_hosts` is
  populated by `RecordScanResult` on each successful scan (untouched on
  errors so the most-recent observation is preserved) and backfilled from
  scan history on migration. It is returned in `GET /endpoints` and
  `GET /endpoints/{id}` JSON for CLI / automation consumers; the web UI
  does not render it. Subtitle on a search result surfaces the matching
  IP when the row matched on the `ip_address` override; otherwise it
  falls back to `dns_name`. CIDR matching is intentionally not yet
  supported — fragments and full literals only.
- **TOTP/2FA for local accounts.** Local users can now arm a second factor
  via any RFC 6238 authenticator app (Google Authenticator, 1Password,
  Authy, etc.). New `/account/2fa` page walks through enrollment with a
  scannable QR plus a base32 fallback for manual entry, surfaces 10
  one-time recovery codes for download or copy, and offers regenerate
  (current TOTP required) and disable (password + TOTP/recovery
  required) flows. SSO accounts are excluded — their MFA story belongs
  to the identity provider — and the page redirects them to the account
  hub. Login is now two-step when a user has TOTP armed: password
  verifies against `POST /auth/login` which returns a 5-minute
  challenge JWT (purpose-stamped `totp_challenge`) instead of a session
  token; the client posts that challenge plus the 6-digit code (or a
  recovery code) to `POST /auth/totp` to mint the real session. The
  challenge token is rejected by the API auth middleware on every
  protected route — a leaked challenge can't substitute for a real
  session even briefly. Secrets are encrypted at rest with AES-256-GCM
  via the existing `TLSENTINEL_ENCRYPTION_KEY`; recovery codes are
  bcrypt-hashed and per-row `used_at`-stamped (single-use, walked O(10)
  on redemption). The lockout-recovery story has two layers — recovery
  codes for self-serve, and a new admin endpoint
  `DELETE /users/{id}/totp` (gated by the new `users:credentials`
  permission, surfaced from Settings → Users as "Reset 2FA") for the
  case where a user lost both their device and their recovery codes.
  Audit entries for `totp.enable` / `totp.disable` /
  `totp.verify_failed` / `totp.recovery_used` /
  `totp.recovery_regenerate` cover every state transition;
  admin-initiated resets carry `reason: admin_reset` plus the actor's
  identity in the entry's details so the trail clearly distinguishes
  self-disable from admin-reset.
- **Installable as a Progressive Web App.** TLSentinel now qualifies for the
  browser install prompt on Chromium (desktop install icon in the address
  bar, Android Chrome "Add to Home Screen") and for iOS Safari's Share →
  Add to Home Screen flow. Backed by a Web App Manifest at
  `/favicon/site.webmanifest` (`id`, `start_url`, `scope`, brand colors,
  `display: standalone`, maskable icons) and a 28-line service worker at
  `/sw.js` with `install`, `activate`, and a deliberately empty `fetch`
  handler. The fetch handler exists only to satisfy Chromium's
  install-qualification heuristic; nothing is cached, because a stale UI
  showing yesterday's cert state is worse than a clear "no internet"
  error. Registration is gated on `import.meta.env.PROD` to keep dev
  Vite HMR clean. The `sw.js` file is also the future hook point for
  Web Push when notification routing becomes a real ask — the existing
  on-call channels (email, Slack, PagerDuty, webhook) remain the
  primary path. A native iOS/Android app is not on the roadmap.
- **Typed endpoint list surfaces.** The single Endpoints page is split into
  three typed lists — Host, SAML, Manual — nested under a new Inventory
  group in the sidebar alongside Certificates and Root Stores. Each list
  is the same `EndpointPage` component parametrized by a `type` prop,
  with a per-type config driving title, description, search placeholder,
  sort options, column grid, and the empty-state copy. Manual endpoints
  drop the address, last-scanned, and scan-errors affordances since they
  don't apply to offline imports. A new `?type=host|saml|manual` query
  param on `GET /endpoints` does the server-side filter; the DB query
  gates on the `endpoints.type` discriminator. Routes are now
  hierarchical — `/endpoints/host`, `/endpoints/saml`, `/endpoints/manual`
  for lists; `/endpoints/:id`, `/endpoints/:id/edit`,
  `/endpoints/:id/scan-history` for details — and `/endpoints` keeps a
  redirect to `/endpoints/host` so old links still land. The create/edit
  form hides the type picker entirely when the type is locked (edit,
  `?type=`, or from-inbox) and the page title + breadcrumb carry the
  type context instead ("Edit Host Endpoint", "Host Endpoints → …").
  Detail and scan-history breadcrumbs point back to the typed list too.
- **In-place scanner token regeneration.** New
  `POST /scanners/{scannerID}/regenerate-token` rotates the bearer token
  without deleting the scanner, so the schedule, thread count, default
  flag, and any endpoint assignments tied to the scanner survive the
  rotation. Previous workflow required revoke-and-recreate, which wiped
  every custom assignment. Audited as `scanner.regenerate_token`.
  Surfaced in the UI from both the row kebab and the Edit Scanner modal
  footer; the existing one-time token reveal is reused with a "Rotated"
  badge.
- **CCADB-backed trust anchor tracking with real chain verification.** New
  `root_stores` and `root_store_anchors` tables, plus a daily refresh job
  that pulls CCADB's trust matrix (Apple, Chrome, Microsoft, Mozilla) and
  the matching PEM bundles, tagging every ingested certificate with a
  `trust_anchor` flag and per-store membership. An in-process trust
  evaluator (`internal/trust`) keeps per-program `crypto/x509.CertPool`s
  in memory — one root pool per program, one shared intermediates pool —
  and runs `x509.Verify()` on every certificate (leaves, intermediates,
  and anchors alike) at ingest and after every root refresh. An anchor
  verifies trivially against any program pool that contains it; an
  intermediate chains to whichever roots sign it; a leaf chains through
  both. Verdicts land in a new `certificate_trust` table, one row per
  `(fingerprint, root_store_id)`, with the Verify error string attached
  to failures so "not trusted by Apple" always comes with a reason.
  `GET /certificates/{fingerprint}` exposes `trustedBy` (stores whose
  `x509.Verify` accepted the leaf — signature, validity window, name
  constraints, EKU=serverAuth, and path length all enforced) and
  `isTrustAnchor` (Subject+SKI-equivalent to a CCADB anchor). Anchor
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
- **Per-program trust anchor browser.** New `GET /root-stores/{id}/anchors`
  endpoint paginates the anchors in a single CCADB program (Microsoft,
  Apple, Mozilla, Chrome) with an optional common-name filter, powering
  the Root Stores page under Inventory. `GET /root-stores` also gained
  `kind`, `sourceUrl`, `anchorCount`, and `updatedAt` fields alongside
  `id` and `name` so the tab strip can show per-program metadata.
- **Subject Organization / Organizational Unit captured on every
  certificate.** New `subject_org` and `subject_ou` columns on the
  `certificates` table (migration 000043), populated on every insert
  path — scanner upload, manual ingest, endpoint link, and CCADB
  refresh. `UpsertTrustAnchor` also sets O/OU on conflict so the weekly
  refresh backfills existing anchor rows. A startup one-shot
  (`BackfillSubjectOrgOU`) parses stored PEMs for pre-existing
  scanner-ingested certs so operators don't need a manual backfill.
  RFC 5280 doesn't require CN in Subject — some CCADB roots (SECOM, a
  handful of EU gov CAs) only populate O or OU, so CN-alone rendering
  previously showed "—" for them.

### Breaking Changes

- **Usernames are now case-insensitive.** `users.username` is migrated from
  `TEXT` to the Postgres `citext` extension (migration 047), so `Bob.Smith`,
  `bob.smith`, and `BOB.SMITH` all resolve to the same account at login,
  in OIDC claim matching, and through the user CRUD endpoints. The display
  case is preserved — whatever case the operator typed at create time is
  what shows up on the user page and in audit logs. The migration includes
  a pre-flight collision check that aborts with a clear error if any two
  existing usernames differ only in case; resolve those duplicates manually
  before applying. Surrounding whitespace is also trimmed at every write
  boundary (login, OIDC, user create/update). This is a storage-layer
  change — clients see no API shape change, but any out-of-band tooling
  that compared usernames byte-exactly should be updated to expect the
  display case to be authoritative.
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

### Changed

- **Mobile-friendly web UI.** The web app was previously desktop-only; below
  ~1024px the sidebar, dense table rows, and oversized headers made the app
  unusable on phones. A consistent breakpoint policy now governs the rework:
  the sidebar collapses into a drawer below `md` (768px); every multi-column
  list view — dashboard panels, Monitor, the five inventory lists
  (hosts, SAML, manual, certificates, root stores), and both Discovery
  surfaces (inbox, networks) — drops to a card-per-row layout below `md`
  with the same affordances as the desktop row (bulk-select checkbox,
  kebab actions, status pills, tag chips); detail pages (Certificate Detail,
  and the three per-type Endpoint Detail pages) size their h1 responsively
  (`text-3xl sm:text-4xl md:text-5xl break-words`) and either stack the
  header action button below the title or hide desktop-only buttons
  entirely (Copy PEM, Download PEM). Card padding drops to `p-4` below `sm`
  to reclaim 8px of side gutter on phones, and side-by-side blocks
  (Security Posture grade vs. score-bar column, Scan History date vs.
  fingerprint) reflow vertically on narrow widths. Phones aren't the
  primary audience, but the app is now usable on one.
- Bump `lucide-react` to 1.8. lucide 1.0 removed every brand logo from the
  icon set, so the Help page's "GitHub repository" card now renders a local
  Octocat mark (inlined under `web/src/components/icons/`, permitted by
  GitHub's brand guidelines) instead of the bundled brand glyph. Fork
  maintainers importing any lucide brand icon — `Github`, `Twitter`, `Chrome`,
  `Figma`, etc. — must swap to a local SVG or alternative before upgrading.

### Security

- Add a break-glass recovery path to the env-var bootstrap for the
  sole-admin lockout case — when a TOTP-enrolled admin loses both
  their authenticator device and their recovery codes (or forgets
  their password) and there is no second admin to perform the reset
  via the UI. Setting `TLSENTINEL_BREAKGLASS=true` plus the user and
  reset flags (`_RESET_TOTP`, `_RESET_PASSWORD` + `_PASSWORD`) on
  startup looks up the named admin and applies the requested resets;
  the master toggle is the explicit "I know what I'm doing" gate, and
  reset flags without it are logged and ignored so an accidentally-
  baked-in compose value won't error every boot. The path refuses to
  operate on non-admin or non-OIDC accounts, fails loud if the named
  user doesn't exist (typo guard rather than silent fallthrough), and
  emits an `auth.bootstrap.breakglass` audit row stamped with the
  `system` actor and the per-action booleans. The first-run seed
  behavior (`TLSENTINEL_ADMIN_USERNAME` / `_PASSWORD` against an
  empty users table) is unchanged.
- Split account-takeover-class user actions onto a dedicated
  `users:credentials` permission. Resetting another user's password
  (`PATCH /users/{id}/password`) and resetting another user's 2FA
  (`DELETE /users/{id}/totp`, new) are gated separately from the
  lifecycle bucket (`users:edit`, which still covers create, update,
  delete, enable/disable). The two are qualitatively different — anyone
  with credential-reset authority can become any other user — so they
  no longer share a gate. Admin holds the new permission via wildcard;
  operator and viewer don't. A regression-guard test pins the role
  grants so a future role-table change can't silently widen the
  takeover surface.
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
- Pin transitive `hono` to ≥ 4.12.14 via npm `overrides` in
  `web/package.json`. Clears the advisory against 4.12.12, which reached the
  dependency tree through `shadcn` → `@modelcontextprotocol/sdk`. Tooling-only
  — `hono` never makes it into the runtime bundle.
- Bump `go.opentelemetry.io/otel`, `otel/trace`, and `otel/metric` to
  v1.43.0 to clear Dependabot advisories GHSA-hfvc-g4fc-pqhx (high — PATH
  hijacking in `otel/sdk` BSD/Solaris resource detection, CVE-2026-39883)
  and GHSA-w8rr-5gcm-pp58 (moderate — unbounded `io.Copy` in OTLP HTTP
  exporters, CVE-2026-39882). Both vulnerabilities live in submodules
  TLSentinel doesn't import, but the advisory database flags the root
  module. otel was pulled in transitively by `uptrace/bun/driver/pgdriver`
  and `golang-migrate/migrate/v4`; adding it to our `go.mod` makes Go's
  minimum-version selection pick the patched version even though those
  upstreams still ask for v1.40.0.

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
