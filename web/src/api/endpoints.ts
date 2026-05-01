import { api } from './client'
import type { Endpoint, EndpointList, EndpointTLSProfile, EndpointScanHistoryList, CreateEndpointRequest, UpdateEndpointRequest, PatchEndpointRequest, BulkImportRequest, BulkImportResponse } from '@/types/api'

/**
 * Endpoint type filter. Empty means no type filter (all types returned);
 * the three explicit values match the `type` discriminator on `endpoints`.
 */
export type EndpointTypeFilter = '' | 'host' | 'saml' | 'manual'

/**
 * Protocol filter for the TLS Posture report drill-down. Empty means no
 * protocol filter; otherwise matches the boolean column on
 * endpoint_tls_profiles. Implies host-type — only host endpoints have TLS
 * profiles, so combining with type=saml/manual yields zero results.
 */
export type ProtocolFilter = '' | 'ssl30' | 'tls10' | 'tls11' | 'tls12' | 'tls13'

export function listEndpoints(
  page = 1,
  pageSize = 20,
  name = '',
  status = '',
  sort = '',
  tagId = '',
  type: EndpointTypeFilter = '',
  protocol: ProtocolFilter = '',
  cipher = '',
): Promise<EndpointList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (name)     params.set('name', name)
  if (status)   params.set('status', status)
  if (sort)     params.set('sort', sort)
  if (tagId)    params.set('tag_id', tagId)
  if (type)     params.set('type', type)
  if (protocol) params.set('protocol', protocol)
  if (cipher)   params.set('cipher', cipher)
  return api.get<EndpointList>(`/endpoints?${params}`)
}

export function listErrorEndpoints(page = 1, pageSize = 20, type: EndpointTypeFilter = ''): Promise<EndpointList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    has_error: 'true',
  })
  if (type) params.set('type', type)
  return api.get<EndpointList>(`/endpoints?${params}`)
}

export function getEndpoint(id: string): Promise<Endpoint> {
  return api.get<Endpoint>(`/endpoints/${id}`)
}

export function createEndpoint(req: CreateEndpointRequest): Promise<Endpoint> {
  return api.post<Endpoint>('/endpoints', req)
}

export function updateEndpoint(id: string, req: UpdateEndpointRequest): Promise<Endpoint> {
  return api.put<Endpoint>(`/endpoints/${id}`, req)
}

export function patchEndpoint(id: string, req: PatchEndpointRequest): Promise<Endpoint> {
  return api.patch<Endpoint>(`/endpoints/${id}`, req)
}

export function deleteEndpoint(id: string): Promise<void> {
  return api.delete<void>(`/endpoints/${id}`)
}

export function getTLSProfile(id: string): Promise<EndpointTLSProfile> {
  return api.get<EndpointTLSProfile>(`/endpoints/${id}/tls-profile`)
}

export function getScanHistory(
  id: string,
  page = 1,
  pageSize = 20,
): Promise<EndpointScanHistoryList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return api.get<EndpointScanHistoryList>(`/endpoints/${id}/history?${params}`)
}

export function linkCertificate(id: string, pem: string): Promise<Endpoint> {
  return api.post<Endpoint>(`/endpoints/${id}/certificate`, { pem })
}

export function bulkImportEndpoints(req: BulkImportRequest): Promise<BulkImportResponse> {
  return api.post<BulkImportResponse>('/endpoints/bulk', req)
}
