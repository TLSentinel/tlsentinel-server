---
title: How the TLS score is calculated
blurb: The SSL Labs-style grade on endpoint detail pages — sub-scores, grade caps, and what the current scanner can't see.
category: Topics
order: 10
---

# How the TLS score is calculated

TLSentinel grades each endpoint using the
[SSL Labs SSL Server Rating Guide](https://github.com/ssllabs/research/wiki/SSL-Server-Rating-Guide)
methodology, applied to the data our scanner currently captures.

## Sub-scores

Three sub-scores (0–100) are computed independently and combined with fixed
weights. The weighted total maps to a letter grade: A ≥ 80, B ≥ 65, C ≥ 50,
D ≥ 35, E ≥ 20, otherwise F.

- **Protocol support · 30%** — Average of the best and worst accepted version.
  TLS 1.2/1.3 = 100, TLS 1.1 = 95, TLS 1.0 = 90, SSL 3.0 = 80, SSL 2.0 = 0.
- **Key exchange · 30%** — Based on the effective strength of the server's
  key (RSA key size, DH/ECDH parameter size). Not currently probed — see
  limitations below.
- **Cipher strength · 40%** — Average of the strongest and weakest accepted
  suite. ≥ 256 bits = 100, 128 bits = 80, < 128 = 20, NULL = 0.

## Automatic failures

These conditions force the grade to F regardless of the weighted score.

| Condition                                             | Effect |
| ----------------------------------------------------- | ------ |
| SSL 2.0 support                                       | F      |
| SSL 3.0 as best protocol                              | F      |
| Only RC4 cipher suites accepted                       | F      |
| Expired, self-signed, or revoked cert                 | F      |
| MD2 or MD5 certificate signature                      | F      |
| Export cipher suites accepted                         | F      |
| Heartbleed, DROWN, or ROBOT vulnerable                | F      |
| Key exchange < 1024 bits                              | F      |

## Grade caps

These conditions limit the maximum grade without forcing a failure.

| Condition                                             | Effect      |
| ----------------------------------------------------- | ----------- |
| POODLE vulnerable                                     | Capped at C |
| RC4 or 3DES accepted with TLS 1.1+                    | Capped at C |
| No TLS 1.2 or 1.3 support                             | Capped at C |
| Key exchange < 2048 bits                              | Capped at B |
| RC4 accepted                                          | Capped at B |
| Incomplete certificate chain                          | Capped at B |
| No forward secrecy (no ECDHE/DHE/TLS 1.3)             | Capped at B |
| No AEAD cipher suites                                 | Capped at B |
| TLS 1.0 or 1.1 enabled                                | Capped at B |
| TLS 1.3 not supported                                 | Capped at A- |
| Missing HSTS                                          | Capped at A- |

## Certificate grades

Two non-letter grades indicate a certificate problem that blocks normal
scoring.

| Condition                                             | Effect |
| ----------------------------------------------------- | ------ |
| Certificate not trusted                               | T      |
| Certificate hostname mismatch                         | M      |

## Current limitations

The scanner today captures TLS versions and accepted cipher suites. Other
inputs the SSL Labs rubric uses are not yet probed; where data is missing,
the score falls back conservatively rather than penalising the endpoint.

- **Key exchange strength** is approximated from the server certificate's
  public key, not from a live DHE/ECDHE handshake probe. RSA keys use
  modulus bits directly; EC keys and Ed25519 are normalised to their
  RSA-equivalent strength per NIST SP 800-57 (P-256 / X25519 / Ed25519 ≈
  3072, P-384 ≈ 7680, P-521 ≈ 15360) so the SSL Labs thresholds
  (< 1024 / 2048 / 4096) compare apples to apples. Servers advertising
  weaker ephemeral parameters than their cert key will not be flagged.
- **HSTS** is not probed. The A- cap for missing HSTS does not apply — an
  otherwise perfect endpoint without HSTS can still grade A.
- **Certificate trust, hostname match, and revocation** are not checked by
  the TLS profile scan. T and M grades are never assigned.
- **Vulnerability probes** (Heartbleed, DROWN, ROBOT) are not run. POODLE
  is inferred from SSL 3.0 support (any server accepting SSLv3 is treated
  as POODLE-vulnerable); the TLS variant of POODLE is not probed.
- **Forward secrecy and AEAD** are inferred from cipher suite names — the
  presence of `ECDHE_`, `DHE_`, `_GCM_`, `_CCM`, `POLY1305`, or a TLS 1.3
  suite name.

What we can't see, we don't penalise. So take this as a generous grade — a
more complete scan may lower it, but won't raise it.
