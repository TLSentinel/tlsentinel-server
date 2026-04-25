import { api } from './client'
import type { User, UserList, TagWithCategory } from '@/types/api'

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
  password?: string
  role: string
  provider: string
  notify: boolean
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}): Promise<User> {
  return api.post<User>('/users', req)
}

export function updateUser(id: string, req: {
  username: string
  role: string
  provider: string
  notify: boolean
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}): Promise<User> {
  return api.put<User>(`/users/${id}`, req)
}

export function setUserEnabled(id: string, enabled: boolean): Promise<User> {
  return api.patch<User>(`/users/${id}/enabled`, { enabled })
}

export function changePassword(id: string, password: string): Promise<void> {
  return api.patch<void>(`/users/${id}/password`, { password })
}

export function deleteUser(id: string): Promise<void> {
  return api.delete<void>(`/users/${id}`)
}

/**
 * Admin: clear another user's TOTP enrollment so they can log in with
 * password alone. Used as the lockout-recovery path when a user has
 * lost both their authenticator device and recovery codes — verify
 * identity out-of-band first. Server gates this on `users:credentials`.
 */
export function resetUserTOTP(id: string): Promise<void> {
  return api.delete<void>(`/users/${id}/totp`)
}

// /me — current user only, no admin required.
export function getMe(): Promise<User> {
  return api.get<User>('/me')
}

export function updateMe(req: {
  notify: boolean
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}): Promise<User> {
  return api.put<User>('/me', req)
}

export function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  return api.patch<void>('/me/password', { currentPassword, newPassword })
}

export function rotateCalendarToken(): Promise<{ calendarToken: string }> {
  return api.post<{ calendarToken: string }>('/me/calendar-token', {})
}

export function getMyTagSubscriptions(): Promise<TagWithCategory[]> {
  return api.get<TagWithCategory[]>('/me/tag-subscriptions')
}

export function setMyTagSubscriptions(tagIds: string[]): Promise<TagWithCategory[]> {
  return api.put<TagWithCategory[]>('/me/tag-subscriptions', { tagIds })
}
