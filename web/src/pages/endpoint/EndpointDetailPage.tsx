import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getEndpoint } from '@/api/endpoints'
import { ApiError } from '@/types/api'
import { DetailShell } from './detail/shared'
import HostEndpointDetailPage from './detail/HostEndpointDetailPage'
import SAMLEndpointDetailPage from './detail/SAMLEndpointDetailPage'
import ManualEndpointDetailPage from './detail/ManualEndpointDetailPage'

export default function EndpointDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: endpoint, isLoading, error } = useQuery({
    queryKey: ['endpoint', id],
    queryFn: () => getEndpoint(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <DetailShell name={null}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </DetailShell>
    )
  }

  if (error) {
    return (
      <DetailShell name={null}>
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'Failed to load endpoint.'}
        </p>
      </DetailShell>
    )
  }

  if (!endpoint) return null

  switch (endpoint.type) {
    case 'saml':   return <SAMLEndpointDetailPage   endpoint={endpoint} />
    case 'manual': return <ManualEndpointDetailPage endpoint={endpoint} />
    default:       return <HostEndpointDetailPage   endpoint={endpoint} />
  }
}
