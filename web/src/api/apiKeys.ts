import { api } from './client'

export interface APIKey {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  createdAt: string
}

export interface CreatedAPIKey extends APIKey {
  token: string // only present on creation
}

export function listAPIKeys(): Promise<APIKey[]> {
  return api.get<APIKey[]>('/me/api-keys')
}

export function createAPIKey(name: string): Promise<CreatedAPIKey> {
  return api.post<CreatedAPIKey>('/me/api-keys', { name })
}

export function deleteAPIKey(id: string): Promise<void> {
  return api.delete(`/me/api-keys/${id}`)
}

// ---------------------------------------------------------------------------
// Admin — all users' keys
// ---------------------------------------------------------------------------

export interface AdminAPIKey extends APIKey {
  userId: string
  username: string
}

export function listAllAPIKeys(): Promise<AdminAPIKey[]> {
  return api.get<AdminAPIKey[]>('/admin/api-keys')
}

export function revokeAPIKey(id: string): Promise<void> {
  return api.delete(`/admin/api-keys/${id}`)
}
