import { api } from './client'
import type { Endpoint, EndpointList, EndpointTLSProfile, EndpointScanHistoryList, CreateEndpointRequest, UpdateEndpointRequest, PatchEndpointRequest, BulkImportRequest, BulkImportResponse } from '@/types/api'

export function listEndpoints(page = 1, pageSize = 20, name = '', status = '', sort = '', tagId = ''): Promise<EndpointList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (name) params.set('name', name)
  if (status) params.set('status', status)
  if (sort) params.set('sort', sort)
  if (tagId) params.set('tag_id', tagId)
  return api.get<EndpointList>(`/endpoints?${params}`)
}

export function listErrorEndpoints(page = 1, pageSize = 20): Promise<EndpointList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    has_error: 'true',
  })
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
