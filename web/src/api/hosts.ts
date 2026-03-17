import { api } from './client'
import type { Host, HostList, HostTLSProfile, HostScanHistoryList, CreateHostRequest, UpdateHostRequest } from '@/types/api'

export function listHosts(page = 1, pageSize = 20): Promise<HostList> {
  return api.get<HostList>(`/hosts?page=${page}&page_size=${pageSize}`)
}

export function listErrorHosts(page = 1, pageSize = 20): Promise<HostList> {
  return api.get<HostList>(`/hosts?page=${page}&page_size=${pageSize}&has_error=true`)
}

export function getHost(id: string): Promise<Host> {
  return api.get<Host>(`/hosts/${id}`)
}

export function createHost(req: CreateHostRequest): Promise<Host> {
  return api.post<Host>('/hosts', req)
}

export function updateHost(id: string, req: UpdateHostRequest): Promise<Host> {
  return api.put<Host>(`/hosts/${id}`, req)
}

export function deleteHost(id: string): Promise<void> {
  return api.delete<void>(`/hosts/${id}`)
}

export function getTLSProfile(id: string): Promise<HostTLSProfile> {
  return api.get<HostTLSProfile>(`/hosts/${id}/tls-profile`)
}

export function getScanHistory(id: string, limit = 20): Promise<HostScanHistoryList> {
  return api.get<HostScanHistoryList>(`/hosts/${id}/history?limit=${limit}`)
}
