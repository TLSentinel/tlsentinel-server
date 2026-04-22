import { api } from './client'
import type {
  ScannerToken,
  ScannerTokenCreated,
  ScannerTokenRegenerated,
  PatchScannerRequest,
} from '@/types/api'

export function listScanners(): Promise<ScannerToken[]> {
  return api.get<ScannerToken[]>('/scanners')
}

export function createScanner(name: string): Promise<ScannerTokenCreated> {
  return api.post<ScannerTokenCreated>('/scanners', { name })
}

export function updateScanner(
  id: string,
  name: string,
  scanCronExpression: string,
  scanConcurrency: number,
): Promise<ScannerToken> {
  return api.put<ScannerToken>(`/scanners/${id}`, { name, scanCronExpression, scanConcurrency })
}

export function patchScanner(id: string, req: PatchScannerRequest): Promise<ScannerToken> {
  return api.patch<ScannerToken>(`/scanners/${id}`, req)
}

export function setDefaultScanner(id: string): Promise<void> {
  return api.post<void>(`/scanners/${id}/default`, {})
}

/**
 * Rotates the scanner's bearer token in place. All other scanner configuration
 * (name, schedule, concurrency, default flag, endpoint assignments) is
 * preserved. The new raw token is returned once and cannot be retrieved again.
 */
export function regenerateScannerToken(id: string): Promise<ScannerTokenRegenerated> {
  return api.post<ScannerTokenRegenerated>(`/scanners/${id}/regenerate-token`, {})
}

export function deleteScanner(id: string): Promise<void> {
  return api.delete<void>(`/scanners/${id}`)
}
