import { api } from './client'
import type {
  DiscoveryNetwork,
  DiscoveryNetworkList,
  CreateDiscoveryNetworkRequest,
  UpdateDiscoveryNetworkRequest,
} from '@/types/api'

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
