# Known Issues & Future Enhancements

## Certificate Chain Reconciliation

### Cross-signed certificates / non-unique Subject Key IDs

**Status:** Known limitation
**Area:** `certmonitor.certificates`, `ReconcileCertificateChains`, `backfill_issuer_fingerprint` trigger

The certificate chain linking logic (both the INSERT trigger and the Go-side
`ReconcileCertificateChains` function) resolves issuers by matching a
certificate's `authority_key_id` against another certificate's `subject_key_id`.
This assumes `subject_key_id` is unique per issuer, which holds for the vast
majority of real-world chains.

It breaks down in two known scenarios:

1. **Cross-signed certificates** — the same CA key pair is signed by two
   different trust anchors, producing two distinct certificate rows that share
   a `subject_key_id`. The canonical example is the Let's Encrypt `ISRG Root X1`
   cross-signed by IdenTrust `DST Root CA X3`. If both are present in the
   database, the SKID lookup is ambiguous.

2. **CA certificate renewal with key reuse** — when a CA re-issues its own
   certificate with the same key (new serial, new validity window), the old and
   new CA certs share a `subject_key_id`. Both are valid issuers from a leaf
   certificate's perspective.

**Current behaviour:** The INSERT trigger's scalar subquery will error if it
finds multiple rows with the same SKID. `ReconcileCertificateChains` will
silently set `issuer_fingerprint` to a non-deterministic winner among the
matching rows.

**Possible fix:** Store multiple candidate issuers (e.g. an
`issuer_fingerprints TEXT[]` column) and resolve the correct one at query time
using validity period overlap or explicit trust anchor configuration. For a
private-infrastructure monitoring tool this edge case is unlikely to be
encountered in practice.
