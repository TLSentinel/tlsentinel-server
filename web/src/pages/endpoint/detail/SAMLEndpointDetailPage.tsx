import { Link } from 'react-router-dom'
import { FileEdit, ExternalLink, ShieldCheck, BadgeCheck } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getScanHistory, patchEndpoint } from '@/api/endpoints'
import { getEndpointTags } from '@/api/tags'
import type { Endpoint, EndpointCert, EndpointScanHistoryItem, TagWithCategory } from '@/types/api'
import {
  Section,
  Row,
  BackBreadcrumb,
  EndpointHeader,
  TagsRow,
  LastScanErrorBanner,
  MonitoringRows,
  NotesSection,
  ScanHistorySection,
} from './shared'

// ---------------------------------------------------------------------------
// SAML certificate cards (one per use, shown side-by-side)
// ---------------------------------------------------------------------------

type CertKind = 'encryption' | 'signing'

const CERT_KIND_META: Record<CertKind, { title: string; icon: React.ComponentType<{ className?: string }>; empty: string }> = {
  encryption: {
    title: 'Encryption Certificate',
    icon:  ShieldCheck,
    empty: 'No encryption certificate extracted yet.',
  },
  signing: {
    title: 'Signing Certificate',
    icon:  BadgeCheck,
    empty: 'No signing certificate extracted yet.',
  },
}

function pickCert(certs: EndpointCert[], kind: CertKind): EndpointCert | null {
  const ofKind = certs.filter((c) => c.certUse === kind)
  return ofKind.find((c) => c.isCurrent) ?? ofKind[0] ?? null
}

function SAMLCertCard({ kind, cert }: { kind: CertKind; cert: EndpointCert | null }) {
  const meta = CERT_KIND_META[kind]
  const Icon = meta.icon

  if (!cert) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="w-14 h-14 rounded-xl bg-muted/60 flex items-center justify-center">
          <Icon className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="mt-6 text-lg font-semibold">{meta.title}</h3>
        <p className="mt-3 text-sm italic text-muted-foreground">{meta.empty}</p>
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
          <Icon className={`h-7 w-7 ${iconColor}`} />
        </div>
        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>

      <h3 className="mt-6 text-lg font-semibold">{meta.title}</h3>

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

function SAMLCertCards({ certs }: { certs: EndpointCert[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <SAMLCertCard kind="encryption" cert={pickCert(certs, 'encryption')} />
      <SAMLCertCard kind="signing"    cert={pickCert(certs, 'signing')}    />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Valid-until value with expiry warning
// ---------------------------------------------------------------------------

function SAMLValidUntilValue({ validUntil }: { validUntil: string }) {
  const when = new Date(validUntil)
  const days = Math.floor((when.getTime() - Date.now()) / 86_400_000)
  const expired = days < 0
  const warning = !expired && days <= 30
  const cls =
    expired ? 'text-error' :
    warning ? 'text-warning' :
              'text-foreground'
  const suffix =
    expired ? `expired ${Math.abs(days)}d ago` :
              `in ${days} ${days === 1 ? 'day' : 'days'}`
  return (
    <span className={cls}>
      {when.toLocaleDateString()} <span className="text-muted-foreground">({suffix})</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Configuration section (SAML-specific fields)
// ---------------------------------------------------------------------------

function ConfigurationSection({
  endpoint,
  onToggleEnabled,
  onToggleScanning,
}: {
  endpoint: Endpoint
  onToggleEnabled: (enabled: boolean) => void
  onToggleScanning: (enabled: boolean) => void
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
        <dl>
          <Row label="Metadata URL">
            {endpoint.url ? (
              <a
                href={endpoint.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all text-right"
              >
                <span className="break-all">{endpoint.url}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="italic text-muted-foreground">—</span>
            )}
          </Row>
          {endpoint.samlMetadata?.entityId && (
            <Row label="Entity ID">
              <span className="break-all">{endpoint.samlMetadata.entityId}</span>
            </Row>
          )}
          {endpoint.samlMetadata?.role && (
            <Row label="Role">
              <span className="uppercase tracking-wide">{endpoint.samlMetadata.role}</span>
            </Row>
          )}
          {endpoint.samlMetadata?.validUntil && (
            <Row label="Valid Until">
              <SAMLValidUntilValue validUntil={endpoint.samlMetadata.validUntil} />
            </Row>
          )}
          <Row label="Scanner">
            <span className="text-base font-semibold">{endpoint.scannerName ?? 'Default'}</span>
          </Row>
          <MonitoringRows
            endpoint={endpoint}
            onToggleEnabled={onToggleEnabled}
            onToggleScanning={onToggleScanning}
          />
        </dl>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SAMLEndpointDetailPage({ endpoint }: { endpoint: Endpoint }) {
  const id = endpoint.id

  const { data: historyData } = useQuery({
    queryKey: ['endpoint', id, 'history', 'recent'],
    queryFn: () => getScanHistory(id, 1, 10),
  })

  const { data: tagsData } = useQuery({
    queryKey: ['endpoint', id, 'tags'],
    queryFn: () => getEndpointTags(id),
  })

  const queryClient = useQueryClient()
  const { mutate: toggleScanning } = useMutation({
    mutationFn: (scanExempt: boolean) => patchEndpoint(id, { scanExempt }),
    onSuccess: (updated) => queryClient.setQueryData(['endpoint', id], updated),
  })
  const { mutate: toggleEnabled } = useMutation({
    mutationFn: (enabled: boolean) => patchEndpoint(id, { enabled }),
    onSuccess: (updated) => queryClient.setQueryData(['endpoint', id], updated),
  })

  const history: EndpointScanHistoryItem[] | null = historyData?.items ?? null
  const historyTotal = historyData?.totalCount ?? 0
  const tags: TagWithCategory[] = tagsData ?? []

  return (
    <div className="space-y-5">
      <BackBreadcrumb name={endpoint.name} type="saml" />

      <EndpointHeader endpoint={endpoint} />

      <TagsRow tags={tags} />

      {endpoint.lastScanError && <LastScanErrorBanner message={endpoint.lastScanError} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <ConfigurationSection
            endpoint={endpoint}
            onToggleEnabled={toggleEnabled}
            onToggleScanning={(on) => toggleScanning(!on)}
          />
          <SAMLCertCards certs={endpoint.activeCerts} />
        </div>

        <div className="space-y-5 lg:col-span-1">
          <NotesSection endpoint={endpoint} />
          <ScanHistorySection items={history} endpointID={id} totalCount={historyTotal} />
        </div>
      </div>
    </div>
  )
}
