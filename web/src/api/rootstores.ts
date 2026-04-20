import { api } from './client'
import type { RootStoreSummary } from '@/types/api'

export function listRootStores(): Promise<RootStoreSummary[]> {
  return api.get<RootStoreSummary[]>('/root-stores')
}
