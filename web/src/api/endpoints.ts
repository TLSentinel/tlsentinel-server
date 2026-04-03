import { api } from './client'
import type { Endpoint, EndpointList, EndpointTLSProfile, EndpointScanHistoryList, CreateEndpointRequest, UpdateEndpointRequest } from '@/types/api'

export function listEndpoints(page = 1, pageSize = 20, name = '', status = '', sort = ''): Promise<EndpointList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (name) params.set('name', name)
  if (status) params.set('status', status)
  if (sort) params.set('sort', sort)
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

export function deleteEndpoint(id: string): Promise<void> {
  return api.delete<void>(`/endpoints/${id}`)
}

export function getTLSProfile(id: string): Promise<EndpointTLSProfile> {
  return api.get<EndpointTLSProfile>(`/endpoints/${id}/tls-profile`)
}

export function getScanHistory(id: string, limit = 20): Promise<EndpointScanHistoryList> {
  return api.get<EndpointScanHistoryList>(`/endpoints/${id}/history?limit=${limit}`)
}

export function linkCertificate(id: string, pem: string): Promise<Endpoint> {
  return api.post<Endpoint>(`/endpoints/${id}/certificate`, { pem })
}
