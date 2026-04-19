import { Link } from 'react-router-dom'
import { ChevronRight, ExternalLink } from 'lucide-react'

// ---------------------------------------------------------------------------
// Help → TLS Score
//
// Explains how the SSL Labs-style grade on the endpoint detail page is
// calculated, and which parts of the rubric the current TLSentinel scanner
// does not yet probe. Keep this page in sync with internal/tlsprofile/score.go.
// ---------------------------------------------------------------------------

interface CapRow {
  condition: string
  effect: string
}

const FORCE_F: CapRow[] = [
  { condition: 'SSL 2.0 support',                         effect: 'F' },
  { condition: 'Expired, self-signed, or revoked cert',   effect: 'F' },
  { condition: 'MD2 or MD5 certificate signature',        effect: 'F' },
  { condition: 'Export cipher suites accepted',           effect: 'F' },
  { condition: 'Heartbleed, DROWN, or ROBOT vulnerable',  effect: 'F' },
  { condition: 'Key exchange < 1024 bits',                effect: 'F' },
]

const CAPS: CapRow[] = [
  { condition: 'POODLE vulnerable',                       effect: 'Capped at C' },
  { condition: 'RC4 or 3DES accepted with TLS 1.1+',      effect: 'Capped at C' },
  { condition: 'Key exchange < 2048 bits',                effect: 'Capped at B' },
  { condition: 'RC4 accepted',                            effect: 'Capped at B' },
  { condition: 'Incomplete certificate chain',            effect: 'Capped at B' },
  { condition: 'No forward secrecy (no ECDHE/DHE/TLS 1.3)', effect: 'Capped at B' },
  { condition: 'No AEAD cipher suites',                   effect: 'Capped at B' },
  { condition: 'TLS 1.0 or 1.1 enabled',                  effect: 'Capped at B' },
  { condition: 'TLS 1.3 not supported',                   effect: 'Capped at A-' },
  { condition: 'Missing HSTS',                            effect: 'Capped at A-' },
]

const SPECIAL: CapRow[] = [
  { condition: 'Certificate not trusted',                 effect: 'T' },
  { condition: 'Certificate hostname mismatch',           effect: 'M' },
]

function CapTable({ rows }: { rows: CapRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="pb-2 font-medium text-muted-foreground">Condition</th>
          <th className="pb-2 font-medium text-muted-foreground w-32">Effect</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r) => (
          <tr key={r.condition}>
            <td className="py-2">{r.condition}</td>
            <td className="py-2 font-mono text-xs">{r.effect}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ScoringPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/dashboard" className="hover:text-foreground">Dashboard</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Help — TLS Score</span>
      </nav>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-semibold">How the TLS score is calculated</h1>
        <p className="text-sm text-muted-foreground mt-1">
          TLSentinel grades each endpoint using the{' '}
          <a
            href="https://github.com/ssllabs/research/wiki/SSL-Server-Rating-Guide"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            SSL Labs SSL Server Rating Guide
            <ExternalLink className="h-3 w-3" />
          </a>{' '}
          methodology, applied to the data our scanner currently captures.
        </p>
      </div>

      {/* Sub-scores */}
      <div className="rounded-lg border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Sub-scores</h2>
        <p className="text-sm text-muted-foreground">
          Three sub-scores (0–100) are computed independently and combined with fixed weights.
          The weighted total maps to a letter grade: A ≥ 80, B ≥ 65, C ≥ 50, D ≥ 35, E ≥ 20,
          otherwise F.
        </p>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium">Protocol support · 30%</dt>
            <dd className="text-muted-foreground mt-0.5">
              Average of the best and worst accepted version. TLS 1.2/1.3 = 100, TLS 1.1 = 95,
              TLS 1.0 = 90, SSL 3.0 = 80, SSL 2.0 = 0.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Key exchange · 30%</dt>
            <dd className="text-muted-foreground mt-0.5">
              Based on the effective strength of the server's key (RSA key size, DH/ECDH
              parameter size). Not currently probed — see limitations below.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Cipher strength · 40%</dt>
            <dd className="text-muted-foreground mt-0.5">
              Average of the strongest and weakest accepted suite. ≥ 256 bits = 100, 128 bits = 80,
              &lt; 128 = 20, NULL = 0.
            </dd>
          </div>
        </dl>
      </div>

      {/* Automatic failures */}
      <div className="rounded-lg border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Automatic failures</h2>
        <p className="text-sm text-muted-foreground">
          These conditions force the grade to F regardless of the weighted score.
        </p>
        <CapTable rows={FORCE_F} />
      </div>

      {/* Grade caps */}
      <div className="rounded-lg border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Grade caps</h2>
        <p className="text-sm text-muted-foreground">
          These conditions limit the maximum grade without forcing a failure.
        </p>
        <CapTable rows={CAPS} />
      </div>

      {/* Special grades */}
      <div className="rounded-lg border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Certificate grades</h2>
        <p className="text-sm text-muted-foreground">
          Two non-letter grades indicate a certificate problem that blocks normal scoring.
        </p>
        <CapTable rows={SPECIAL} />
      </div>

      {/* Limitations */}
      <div id="limitations" className="rounded-lg border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Current limitations</h2>
        <p className="text-sm text-muted-foreground">
          The scanner today captures TLS versions and accepted cipher suites. Other inputs the
          SSL Labs rubric uses are not yet probed; where data is missing, the score falls back
          conservatively rather than penalising the endpoint.
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-muted-foreground/40">·</span>
            <span>
              <span className="font-medium text-foreground">Key exchange strength</span> is
              approximated from the server certificate's public key (RSA modulus, ECDSA curve,
              Ed25519 = 256), not from a live DHE/ECDHE handshake probe. Servers advertising
              weaker ephemeral parameters than their cert key will not be flagged.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-muted-foreground/40">·</span>
            <span>
              <span className="font-medium text-foreground">HSTS</span> is not probed. The A- cap
              for missing HSTS does not apply — an otherwise perfect endpoint without HSTS can
              still grade A.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-muted-foreground/40">·</span>
            <span>
              <span className="font-medium text-foreground">Certificate trust, hostname match,
              and revocation</span> are not checked by the TLS profile scan. T and M grades are
              never assigned.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-muted-foreground/40">·</span>
            <span>
              <span className="font-medium text-foreground">Vulnerability probes</span>{' '}
              (Heartbleed, POODLE, DROWN, ROBOT) are not run. Their caps and forced-F effects do
              not apply.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-muted-foreground/40">·</span>
            <span>
              <span className="font-medium text-foreground">Forward secrecy and AEAD</span> are
              inferred from cipher suite names — the presence of{' '}
              <code className="font-mono text-xs">ECDHE_</code>,{' '}
              <code className="font-mono text-xs">DHE_</code>,{' '}
              <code className="font-mono text-xs">_GCM_</code>,{' '}
              <code className="font-mono text-xs">_CCM</code>,{' '}
              <code className="font-mono text-xs">POLY1305</code>, or a TLS 1.3 suite name.
            </span>
          </li>
        </ul>
        <p className="text-sm text-muted-foreground pt-1">
          What we can't see, we don't penalise. So take this as a generous grade — a more
          complete scan may lower it, but won't raise it.
        </p>
      </div>
    </div>
  )
}
