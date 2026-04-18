import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { fmtDate } from '@/lib/utils'

interface CertProgressCardProps {
  fingerprint: string
  commonName: string
  notBefore: string
  notAfter: string
  /** Label shown next to the KeyRound icon (cert type or chain role). */
  label: string
  /** When true the fingerprint is rendered as plain text instead of a link. */
  isViewing?: boolean
}

export function CertProgressCard({
  fingerprint,
  commonName,
  notBefore,
  notAfter,
  label,
  isViewing = false,
}: CertProgressCardProps) {
  const now       = Date.now()
  const issued    = new Date(notBefore).getTime()
  const expiry    = new Date(notAfter).getTime()
  const daysLeft  = Math.floor((expiry - now) / 86_400_000)
  const isExpired = daysLeft < 0
  const isWarning = !isExpired && daysLeft <= 30
  const pct       = Math.round(Math.min(Math.max((now - issued) / (expiry - issued), 0), 1) * 100)

  const accentClass = isExpired ? 'border-l-error'     : isWarning ? 'border-l-warning'     : 'border-l-tertiary'
  const barClass    = isExpired ? 'bg-error'           : isWarning ? 'bg-warning'           : 'bg-tertiary'

  return (
    <div className={`rounded-xl bg-card border border-l-4 border-border ${accentClass} px-4 py-3 space-y-3`}>
      {/* Label */}
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <KeyRound className="h-3.5 w-3.5" />
        {label}
      </div>

      {/* Common name + expiry */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Common Name</p>
          <p className="mt-0.5 font-semibold truncate">{commonName || '—'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Expiry</p>
          <p className="mt-0.5 font-semibold">{fmtDate(notAfter)}</p>
        </div>
      </div>

      {/* Lifetime progress */}
      <div className="space-y-1.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Issued: {fmtDate(notBefore)}</span>
          <span>{isExpired ? 'Expired' : `Days remaining: ${daysLeft}`}</span>
        </div>
      </div>

      {/* Fingerprint */}
      <div className="border-t border-outline-variant pt-2">
        {isViewing ? (
          <span className="block truncate font-mono text-xs text-muted-foreground/70">{fingerprint}</span>
        ) : (
          <Link
            to={`/certificates/${fingerprint}`}
            className="block truncate font-mono text-xs text-muted-foreground/70 hover:text-primary hover:underline"
          >
            {fingerprint}
          </Link>
        )}
      </div>
    </div>
  )
}
