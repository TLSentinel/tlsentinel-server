import { api } from './client'
import type { TLSPostureReport } from '@/types/api'

export function getTLSPostureReport(): Promise<TLSPostureReport> {
  return api.get<TLSPostureReport>('/reports/tls-posture')
}
