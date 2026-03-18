import { api } from './client'

export interface ExpiringCertItem {
  hostId: string
  hostName: string
  dnsName: string
  port: number
  fingerprint: string
  commonName: string
  notAfter: string
  daysRemaining: number
}

export interface ExpiringCertList {
  items: ExpiringCertItem[]
}

export function getExpiringCerts(days = 30): Promise<ExpiringCertList> {
  return api.get<ExpiringCertList>(`/certificates/expiring?days=${days}`)
}

export function listExpiry(): Promise<ExpiringCertList> {
  return api.get<ExpiringCertList>('/certificates/active')
}
