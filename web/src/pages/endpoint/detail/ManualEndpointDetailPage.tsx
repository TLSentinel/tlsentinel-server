import { Link } from 'react-router-dom'
import { FileEdit, ShieldCheck } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { patchEndpoint } from '@/api/endpoints'
import { getEndpointTags } from '@/api/tags'
import type { Endpoint, EndpointCert, TagWithCategory } from '@/types/api'
import {
  Section,
  BackBreadcrumb,
  EndpointHeader,
  TagsRow,
  MonitoringRows,
  NotesSection,
} from './shared'

// ---------------------------------------------------------------------------
// Linked certificate card (shaped like SAML cert cards — half-column on md+)
// ---------------------------------------------------------------------------

function LinkedCertCard({ cert }: { cert: EndpointCert | null }) {
  if (!cert) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="w-14 h-14 rounded-xl bg-muted/60 flex items-center justify-center">
          <ShieldCheck className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="mt-6 text-lg font-semibold">Certificate</h3>
        <p className="mt-3 text-sm italic text-muted-foreground">No certificate linked.</p>
      </div>
    )
  }

  const days    = Math.floor((new Date(cert.notAfter).getTime() - Date.now()) / 86_400_000)
  const expired = days < 0
  const warning = !expired && days <= 30

  const iconBg =
    expired ? 'bg-error-container/40'   :
    warning ? 'bg-warning-container/40' :
              'bg-primary-container/30'
  const iconColor =
    expired ? 'text-error'   :
    warning ? 'text-warning' :
              'text-foreground/70'

  const badgeLabel =
    expired ? 'Expired' :
    warning ? 'Warning' :
              'Active'
  const badgeClass =
    expired ? 'bg-error-container text-on-error-container'       :
    warning ? 'bg-warning-container text-on-warning-container'   :
              'bg-tertiary-container text-on-tertiary-container'

  const statusWord =
    expired ? `Expired ${Math.abs(days)}d ago` :
    warning ? 'Expiring Soon' :
              'Valid'
  const statusColor =
    expired ? 'text-error'    :
    warning ? 'text-warning'  :
              'text-tertiary'
  const daysText = expired ? '' : `Expires in ${days} ${days === 1 ? 'day' : 'days'}`

  return (
    <div className="rounded-xl bg-card border border-border p-6">
      <div className="flex items-start justify-between gap-3">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${iconBg}`}>
          <ShieldCheck className={`h-7 w-7 ${iconColor}`} />
        </div>
        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>

      <h3 className="mt-6 text-lg font-semibold">Certificate</h3>

      <dl className="mt-5 space-y-4">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Common Name</dt>
          <dd className="mt-1 text-sm font-medium truncate">{cert.commonName || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Expiry Status</dt>
          <dd className="mt-1 text-sm">
            <span className={`font-semibold ${statusColor}`}>{statusWord}</span>
            {daysText && <span className="ml-2 text-muted-foreground">{daysText}</span>}
          </dd>
        </div>
      </dl>

      <Link
        to={`/certificates/${cert.fingerprint}`}
        className="mt-6 block w-full rounded-md bg-muted/60 hover:bg-muted py-2.5 text-center text-sm font-medium"
      >
        View Details
      </Link>
    </div>
  )
}

function LinkedCertCards({ certs }: { certs: EndpointCert[] }) {
  const cert = certs.find((c) => c.isCurrent) ?? certs[0] ?? null
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <LinkedCertCard cert={cert} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Configuration section (manual — no DNS/IP/port/scanner/scanning)
// ---------------------------------------------------------------------------

function ConfigurationSection({
  endpoint,
  onToggleEnabled,
}: {
  endpoint: Endpoint
  onToggleEnabled: (enabled: boolean) => void
}) {
  return (
    <Section
      title="Configuration"
      titleClassName="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
      bareTitle
      action={
        <Link
          to={`/endpoints/${endpoint.id}/edit`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Edit configuration"
        >
          <FileEdit className="h-4 w-4" />
        </Link>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground italic">
          Manually tracked — certificate is linked directly, no scanning.
        </p>
        <dl>
          <MonitoringRows
            endpoint={endpoint}
            onToggleEnabled={onToggleEnabled}
            showScanning={false}
          />
        </dl>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ManualEndpointDetailPage({ endpoint }: { endpoint: Endpoint }) {
  const id = endpoint.id

  const { data: tagsData } = useQuery({
    queryKey: ['endpoint', id, 'tags'],
    queryFn: () => getEndpointTags(id),
  })

  const queryClient = useQueryClient()
  const { mutate: toggleEnabled } = useMutation({
    mutationFn: (enabled: boolean) => patchEndpoint(id, { enabled }),
    onSuccess: (updated) => queryClient.setQueryData(['endpoint', id], updated),
  })

  const tags: TagWithCategory[] = tagsData ?? []

  return (
    <div className="space-y-5">
      <BackBreadcrumb name={endpoint.name} type="manual" />

      <EndpointHeader endpoint={endpoint} showLastScanned={false} />

      <TagsRow tags={tags} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <ConfigurationSection endpoint={endpoint} onToggleEnabled={toggleEnabled} />
          <LinkedCertCards certs={endpoint.activeCerts} />
        </div>
        <div className="space-y-5 lg:col-span-1">
          <NotesSection endpoint={endpoint} />
        </div>
      </div>
    </div>
  )
}
