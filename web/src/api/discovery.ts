import { api } from './client'
import type {
  DiscoveryNetwork,
  DiscoveryNetworkList,
  CreateDiscoveryNetworkRequest,
  UpdateDiscoveryNetworkRequest,
  DiscoveryInboxItem,
  DiscoveryInboxList,
  Endpoint,
} from '@/types/api'

export interface PromoteDiscoveryInboxRequest {
  name: string
  dnsName: string
  enabled: boolean
  scannerId: string | null
}

export function listDiscoveryNetworks(page = 1, pageSize = 20): Promise<DiscoveryNetworkList> {
  return api.get<DiscoveryNetworkList>(`/discovery/networks?page=${page}&page_size=${pageSize}`)
}

export function getDiscoveryNetwork(id: string): Promise<DiscoveryNetwork> {
  return api.get<DiscoveryNetwork>(`/discovery/networks/${id}`)
}

export function createDiscoveryNetwork(req: CreateDiscoveryNetworkRequest): Promise<DiscoveryNetwork> {
  return api.post<DiscoveryNetwork>('/discovery/networks', req)
}

export function updateDiscoveryNetwork(id: string, req: UpdateDiscoveryNetworkRequest): Promise<DiscoveryNetwork> {
  return api.put<DiscoveryNetwork>(`/discovery/networks/${id}`, req)
}

export function deleteDiscoveryNetwork(id: string): Promise<void> {
  return api.delete<void>(`/discovery/networks/${id}`)
}

export function listDiscoveryInbox(
  page = 1,
  pageSize = 20,
  networkId = '',
  status = '',
  showDismissed = false,
): Promise<DiscoveryInboxList> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (networkId) params.set('network_id', networkId)
  if (status) params.set('status', status)
  if (showDismissed) params.set('show_dismissed', 'true')
  return api.get<DiscoveryInboxList>(`/discovery/inbox?${params}`)
}

export function getDiscoveryInboxItem(id: string): Promise<DiscoveryInboxItem> {
  return api.get<DiscoveryInboxItem>(`/discovery/inbox/${id}`)
}

export function promoteDiscoveryInboxItem(id: string, req: PromoteDiscoveryInboxRequest): Promise<Endpoint> {
  return api.post<Endpoint>(`/discovery/inbox/${id}/promote`, req)
}

export function dismissDiscoveryInboxItem(id: string): Promise<void> {
  return api.post<void>(`/discovery/inbox/${id}/dismiss`, {})
}

export function deleteDiscoveryInboxItem(id: string): Promise<void> {
  return api.delete<void>(`/discovery/inbox/${id}`)
}
