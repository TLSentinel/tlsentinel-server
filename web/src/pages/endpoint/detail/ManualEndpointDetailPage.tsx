import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, XCircle, FileEdit } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { patchEndpoint } from '@/api/endpoints'
import { getEndpointTags } from '@/api/tags'
import type { Endpoint, EndpointCert, TagWithCategory } from '@/types/api'
import { fmtDate } from '@/lib/utils'
import {
  Section,
  BackBreadcrumb,
  EndpointHeader,
  TagsRow,
  MonitoringRows,
  NotesSection,
} from './shared'

// ---------------------------------------------------------------------------
// Linked certificate card
// ---------------------------------------------------------------------------

function LinkedCertificatesSection({ certs }: { certs: EndpointCert[] }) {
  return (
    <Section title="Linked Certificate" titleClassName="text-xs font-semibold uppercase tracking-widest text-muted-foreground" bareTitle>
      {certs.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No certificate linked.</p>
      ) : (
        <div className="space-y-1.5">
          {certs.map((c) => <CertRow key={c.fingerprint} cert={c} />)}
        </div>
      )}
    </Section>
  )
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
      <BackBreadcrumb name={endpoint.name} />

      <EndpointHeader endpoint={endpoint} showLastScanned={false} />

      <TagsRow tags={tags} />

      <LinkedCertificatesSection certs={endpoint.activeCerts} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ConfigurationSection endpoint={endpoint} onToggleEnabled={toggleEnabled} />
        <NotesSection endpoint={endpoint} />
      </div>
    </div>
  )
}
