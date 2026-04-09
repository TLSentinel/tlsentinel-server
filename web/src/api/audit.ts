import { api } from './client'
import type { AuditLogList } from '@/types/api'

export async function listAuditLogs(
  page = 1,
  pageSize = 50,
  username = '',
  action = '',
): Promise<AuditLogList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (username) params.set('username', username)
  if (action) params.set('action', action)

  return api.get<AuditLogList>(`/logs/audit?${params}`)
}
