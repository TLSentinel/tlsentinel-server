---
title: Root Stores
blurb: What the trust programs are, how TLSentinel refreshes them, and how to read the per-program anchor browser.
category: Topics
order: 20
---

# Root Stores

A **root store** is the list of Certificate Authorities (CAs) that a browser or
operating system trusts by default. When your browser decides whether to show
the padlock for `example.com`, it walks the certificate chain and stops when it
hits a CA already in its local root store. No store membership, no trust — no
matter how well-formed the rest of the chain is.

TLSentinel tracks the four programs that, between them, decide trust for
essentially every mainstream client:

| Program       | Who consumes it                                |
| ------------- | ---------------------------------------------- |
| **Microsoft** | Windows, Edge (Windows), .NET, most Windows apps |
| **Apple**     | macOS, iOS, iPadOS, Safari                     |
| **Mozilla**   | Firefox, Thunderbird, many Linux distributions |
| **Chrome**    | Chrome, Chromium, Chrome OS (via its own CRS)  |

## Where the data comes from

All four programs publish their trust bits through the
[Common CA Database (CCADB)](https://www.ccadb.org/), a Mozilla-run registry
that normalizes each vendor's submissions into CSVs and PEM bundles.
TLSentinel refreshes from CCADB weekly:

1. Pull the per-program trust matrix and PEM bundle.
2. Parse each included anchor into our `certificates` table.
3. Replace the `root_store_anchors` membership atomically per program.
4. Reconcile the `trust_anchor` flag across all certificates by Subject DN +
   Subject Key ID — this is what makes cross-signed copies of an anchor share
   the same flag as the canonical self-signed anchor.

The refresh timestamp shown in the **Last refresh** field on each program tab
is the last successful run of that job.

## Reading the anchor browser

On each program tab you see every trust anchor that program currently
distributes:

- **Common Name** — the anchor's CN, or `—` when the Subject DN uses only O/OU.
  These are rare (three anchors at last count) and will still display by
  organization.
- **Organization** — the anchor's `O=` field from its Subject DN. Useful for
  grouping by CA operator.
- **Fingerprint** — SHA-256, truncated. Click the row (or the fingerprint
  itself) to open the full certificate detail, including the trust matrix
  card showing which other programs also trust this anchor.

## Why counts vary between programs

The programs curate independently. Microsoft's official
program count is typically higher than what ships on a default Windows
install — Windows only pre-installs a small bootstrap set and pulls the rest
on demand via the Automatic Root Update mechanism. Apple and Mozilla ship
their full curated sets in-box. Chrome's Root Store (CRS) is newer and
intentionally leaner than Microsoft's, with some overlap to Mozilla's.

## Related

- [How the TLS score is calculated](/help/scoring) — the grade depends on a
  valid chain to a trusted anchor, but the TLS profile scanner does not
  currently verify trust itself.
