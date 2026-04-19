import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, XCircle, RefreshCw, FileEdit, ExternalLink, Key, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getScanHistory, patchEndpoint } from '@/api/endpoints'
import { getEndpointTags } from '@/api/tags'
import type { Endpoint, EndpointCert, EndpointScanHistoryItem, TagWithCategory } from '@/types/api'
import { fmtDate } from '@/lib/utils'
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
// Metadata URL card — prominent, top of page
// ---------------------------------------------------------------------------

function MetadataUrlCard({ url }: { url: string | null | undefined }) {
  return (
    <Section title="Metadata URL" titleClassName="text-xs font-semibold uppercase tracking-widest text-muted-foreground" bareTitle>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 font-mono text-sm text-primary hover:underline break-all"
        >
          {url}
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
      ) : (
        <p className="text-sm italic text-muted-foreground">No metadata URL configured.</p>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// SAML certificates (grouped by use)
// ---------------------------------------------------------------------------

const CERT_GROUP_META: Record<string, { label: string; icon: React.ReactNode; empty: string }> = {
  signing: {
    label: 'Signing',
    icon:  <Key className="h-4 w-4 text-muted-foreground" />,
    empty: 'No signing certificate extracted yet.',
  },
  encryption: {
    label: 'Encryption',
    icon:  <Lock className="h-4 w-4 text-muted-foreground" />,
    empty: 'No encryption certificate extracted yet.',
  },
}

function CertRow({ cert }: { cert: EndpointCert }) {
  const days = Math.floor((new Date(cert.notAfter).getTime() - Date.now()) / 86_400_000)
  const expired = days < 0
  const warning = !expired && days <= 30
  const statusIcon = expired
    ? <XCircle className="h-4 w-4 shrink-0 text-error" />
    : warning
    ? <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
    : <CheckCircle2 className="h-4 w-4 shrink-0 text-tertiary" />
  const statusText = expired
    ? `Expired ${Math.abs(days)}d ago`
    : warning
    ? `Expires in ${days}d`
    : `Valid · ${fmtDate(cert.notAfter)}`

  return (
    <Link
      to={`/certificates/${cert.fingerprint}`}
      className="block rounded-md border border-border bg-surface-container-low px-3 py-2.5 hover:bg-muted/50"
    >
      <div className="flex items-center gap-3 min-w-0">
        {statusIcon}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{cert.commonName || '—'}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground truncate">{cert.fingerprint}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{statusText}</span>
      </div>
    </Link>
  )
}

function SAMLCertificatesSection({ certs }: { certs: EndpointCert[] }) {
  const groups: Array<{ key: string; certs: EndpointCert[] }> = [
    { key: 'signing',    certs: certs.filter((c) => c.certUse === 'signing') },
    { key: 'encryption', certs: certs.filter((c) => c.certUse === 'encryption') },
  ]

  return (
    <Section title="SAML Certificates" titleClassName="text-xs font-semibold uppercase tracking-widest text-muted-foreground" bareTitle>
      <div className="space-y-5">
        {groups.map((g) => {
          const meta = CERT_GROUP_META[g.key]
          return (
            <div key={g.key}>
              <div className="mb-2 flex items-center gap-2">
                {meta.icon}
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {meta.label}
                </h3>
              </div>
              {g.certs.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">{meta.empty}</p>
              ) : (
                <div className="space-y-1.5">
                  {g.certs.map((c) => <CertRow key={c.fingerprint} cert={c} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
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
    queryKey: ['endpoint', id, 'history'],
    queryFn: () => getScanHistory(id),
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
  const tags: TagWithCategory[] = tagsData ?? []

  return (
    <div className="space-y-5">
      <BackBreadcrumb name={endpoint.name} />

      <EndpointHeader
        endpoint={endpoint}
        action={
          <Button
            onClick={() => { /* TODO: wire up force scan */ }}
            className="h-12 px-4 text-base font-semibold"
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Force Scan
          </Button>
        }
      />

      <TagsRow tags={tags} />

      {endpoint.lastScanError && <LastScanErrorBanner message={endpoint.lastScanError} />}

      <MetadataUrlCard url={endpoint.url} />

      <SAMLCertificatesSection certs={endpoint.activeCerts} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ConfigurationSection
          endpoint={endpoint}
          onToggleEnabled={toggleEnabled}
          onToggleScanning={(on) => toggleScanning(!on)}
        />
        <NotesSection endpoint={endpoint} />
      </div>

      <ScanHistorySection items={history} />
    </div>
  )
}
