import { api } from './client'
import type { Group, GroupList } from '@/types/api'

export function listGroups(page = 1, pageSize = 20): Promise<GroupList> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return api.get<GroupList>(`/groups?${params}`)
}

export function getGroup(id: string): Promise<Group> {
  return api.get<Group>(`/groups/${id}`)
}

export function getGroupHostIDs(id: string): Promise<string[]> {
  return api.get<string[]>(`/groups/${id}/endpoints`)
}

export function createGroup(req: { name: string; description?: string | null; hostIds: string[] }): Promise<Group> {
  return api.post<Group>('/groups', req)
}

export function updateGroup(id: string, req: { name: string; description?: string | null; hostIds: string[] }): Promise<Group> {
  return api.put<Group>(`/groups/${id}`, req)
}

export function deleteGroup(id: string): Promise<void> {
  return api.delete<void>(`/groups/${id}`)
}
