import { api } from './client'
import type { Host, HostList, HostTLSProfile, HostScanHistoryList, CreateHostRequest, UpdateHostRequest } from '@/types/api'

export function listHosts(page = 1, pageSize = 20, name = '', status = '', sort = ''): Promise<HostList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (name) params.set('name', name)
  if (status) params.set('status', status)
  if (sort) params.set('sort', sort)
  return api.get<HostList>(`/endpoints?${params}`)
}

export function listErrorHosts(page = 1, pageSize = 20): Promise<HostList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    has_error: 'true',
  })
  return api.get<HostList>(`/endpoints?${params}`)
}

export function getHost(id: string): Promise<Host> {
  return api.get<Host>(`/endpoints/${id}`)
}

export function createHost(req: CreateHostRequest): Promise<Host> {
  return api.post<Host>('/endpoints', req)
}

export function updateHost(id: string, req: UpdateHostRequest): Promise<Host> {
  return api.put<Host>(`/endpoints/${id}`, req)
}

export function deleteHost(id: string): Promise<void> {
  return api.delete<void>(`/endpoints/${id}`)
}

export function getTLSProfile(id: string): Promise<HostTLSProfile> {
  return api.get<HostTLSProfile>(`/endpoints/${id}/tls-profile`)
}

export function getScanHistory(id: string, limit = 20): Promise<HostScanHistoryList> {
  return api.get<HostScanHistoryList>(`/endpoints/${id}/history?limit=${limit}`)
}
