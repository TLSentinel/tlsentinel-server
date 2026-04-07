import { Link } from 'react-router-dom'
import { Shield, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { fmtDate } from '@/lib/utils'


// ---------------------------------------------------------------------------
// ExpiryStatus — icon + text, no badge pill. Exported for use in page headers.
// ---------------------------------------------------------------------------

export function ExpiryStatus({ notAfter }: { notAfter: string }) {
  const days = Math.floor((new Date(notAfter).getTime() - Date.now()) / 86_400_000)
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600 dark:text-red-400">
        <XCircle className="h-4 w-4 shrink-0" />
        Expired
      </span>
    )
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {days}d
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      Valid
    </span>
  )
}

/** @deprecated Use ExpiryStatus instead */
export const ExpiryBadge = ExpiryStatus

// ---------------------------------------------------------------------------
// CertCard
// ---------------------------------------------------------------------------

interface CertCardProps {
  fingerprint: string
  commonName: string
  notAfter: string
  /** Show a validity date range below the common name. */
  notBefore?: string
  /** Badge label — defaults to 'Leaf'. */
  role?: string
  /** Show a 'viewing' badge — use when the card is the cert currently being viewed. */
  isViewing?: boolean
  /** Truncate the fingerprint to 32 chars. Useful in compact chain lists. */
  truncate?: boolean
}

export function CertCard({
  fingerprint,
  commonName,
  notAfter,
  notBefore,
  role = 'Leaf',
  isViewing = false,
  truncate = false,
}: CertCardProps) {
  const displayFingerprint = truncate ? `${fingerprint.slice(0, 32)}…` : fingerprint

  return (
    <div className="rounded-lg border p-3">
      {/* Status row */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          {role}{isViewing && ' · viewing'}
        </span>
        <ExpiryStatus notAfter={notAfter} />
      </div>

      {/* Common name */}
      <p className="mt-2 font-medium">{commonName || '—'}</p>

      {/* Validity date range — only when notBefore is provided */}
      {notBefore && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {fmtDate(notBefore)} – {fmtDate(notAfter)}
        </p>
      )}

      {/* Fingerprint */}
      <p className="mt-1.5 text-xs text-muted-foreground">Fingerprint</p>
      <p className={`font-mono text-xs text-muted-foreground/70 ${truncate ? '' : 'break-all'}`}>
        {isViewing ? (
          <span>{displayFingerprint}</span>
        ) : (
          <Link
            to={`/certificates/${fingerprint}`}
            className="hover:text-primary hover:underline"
          >
            {displayFingerprint}
          </Link>
        )}
      </p>
    </div>
  )
}
