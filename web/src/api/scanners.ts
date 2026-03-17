import { api } from './client'
import type { ScannerToken, ScannerTokenCreated } from '@/types/api'

export function listScanners(): Promise<ScannerToken[]> {
  return api.get<ScannerToken[]>('/scanners')
}

export function createScanner(name: string): Promise<ScannerTokenCreated> {
  return api.post<ScannerTokenCreated>('/scanners', { name })
}

export function updateScanner(
  id: string,
  name: string,
  scanIntervalSeconds: number,
  scanConcurrency: number,
): Promise<ScannerToken> {
  return api.put<ScannerToken>(`/scanners/${id}`, { name, scanIntervalSeconds, scanConcurrency })
}

export function setDefaultScanner(id: string): Promise<void> {
  return api.post<void>(`/scanners/${id}/default`, {})
}

export function deleteScanner(id: string): Promise<void> {
  return api.delete<void>(`/scanners/${id}`)
}
