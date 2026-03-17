import { Link } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// ExpiryBadge — exported for use in page headers
// ---------------------------------------------------------------------------

export function ExpiryBadge({ notAfter }: { notAfter: string }) {
  const days = Math.floor((new Date(notAfter).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return <Badge variant="destructive">Expired</Badge>
  if (days <= 30) {
    return (
      <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-700">
        Expiring in {days}d
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-green-500 bg-green-50 text-green-700">
      Valid
    </Badge>
  )
}

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
      {/* Badge row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Badge variant="secondary" className="text-xs">{role}</Badge>
        {isViewing && (
          <Badge variant="secondary" className="text-xs">viewing</Badge>
        )}
        <ExpiryBadge notAfter={notAfter} />
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
