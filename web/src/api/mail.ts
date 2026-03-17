import { api } from './client'
import type { MailConfig } from '@/types/api'

export function getMailConfig(): Promise<MailConfig> {
  return api.get<MailConfig>('/settings/mail')
}

export function saveMailConfig(req: {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  authType: string
  smtpUsername: string
  smtpPassword: string // empty string = keep existing password
  fromAddress: string
  fromName: string
  tlsMode: string
}): Promise<MailConfig> {
  return api.put<MailConfig>('/settings/mail', req)
}

export function testMailConfig(to?: string): Promise<void> {
  return api.post<void>('/settings/mail/test', { to: to ?? '' })
}
