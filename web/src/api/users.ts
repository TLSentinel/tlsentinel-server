import { api } from './client'
import type { User, UserList } from '@/types/api'

export function listUsers(page = 1, pageSize = 20, search = '', role = '', provider = '', sort = ''): Promise<UserList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (search) params.set('search', search)
  if (role) params.set('role', role)
  if (provider) params.set('provider', provider)
  if (sort) params.set('sort', sort)
  return api.get<UserList>(`/users?${params}`)
}

export function getUser(id: string): Promise<User> {
  return api.get<User>(`/users/${id}`)
}

export function createUser(req: {
  username: string
  password: string
  role: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}): Promise<User> {
  return api.post<User>('/users', req)
}

export function updateUser(id: string, req: {
  username: string
  role: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}): Promise<User> {
  return api.put<User>(`/users/${id}`, req)
}

export function changePassword(id: string, password: string): Promise<void> {
  return api.patch<void>(`/users/${id}/password`, { password })
}

export function deleteUser(id: string): Promise<void> {
  return api.delete<void>(`/users/${id}`)
}
