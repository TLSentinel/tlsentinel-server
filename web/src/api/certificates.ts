import { api } from './client'
import type {
  CertificateDetail,
  CertificateList,
  EndpointListItem,
  IngestCertificateRequest,
} from '@/types/api'

export interface ExpiringCertItem {
  endpointId: string
  endpointName: string
  dnsName: string
  port: number
  fingerprint: string
  commonName: string
  notAfter: string
  daysRemaining: number
}

export interface ExpiringCertList {
  items: ExpiringCertItem[]
  page: number
  pageSize: number
  totalCount: number
}

export function listCertificates(
  page = 1,
  pageSize = 20,
  commonName = '',
  status = '',
  sort = '',
): Promise<CertificateList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (commonName) params.set('common_name', commonName)
  if (status) params.set('status', status)
  if (sort) params.set('sort', sort)
  return api.get<CertificateList>(`/certificates?${params}`)
}

export function getCertificate(fingerprint: string): Promise<CertificateDetail> {
  return api.get<CertificateDetail>(`/certificates/${fingerprint}`)
}

export function createCertificate(body: IngestCertificateRequest): Promise<CertificateDetail> {
  return api.post<CertificateDetail>('/certificates', body)
}

export function deleteCertificate(fingerprint: string): Promise<void> {
  return api.delete<void>(`/certificates/${fingerprint}`)
}

export function getCertificateHosts(fingerprint: string): Promise<EndpointListItem[]> {
  return api.get<EndpointListItem[]>(`/certificates/${fingerprint}/endpoints`)
}

export function listActive(page = 1, pageSize = 20, name = '', status = '', sort = ''): Promise<ExpiringCertList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (name) params.set('name', name)
  if (status) params.set('status', status)
  if (sort) params.set('sort', sort)
  return api.get<ExpiringCertList>(`/certificates/active?${params}`)
}

export function getExpiringCerts(days = 30): Promise<ExpiringCertList> {
  return api.get<ExpiringCertList>(`/certificates/expiring?days=${days}`)
}
