import { api } from './client'
import type {
  CertificateDetail,
  CertificateList,
  HostListItem,
  IngestCertificateRequest,
} from '@/types/api'

export function listCertificates(
  page = 1,
  pageSize = 20,
  commonName = '',
): Promise<CertificateList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (commonName) params.set('common_name', commonName)
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

export function getCertificateHosts(fingerprint: string): Promise<HostListItem[]> {
  return api.get<HostListItem[]>(`/certificates/${fingerprint}/hosts`)
}
