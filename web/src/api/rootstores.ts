import { api } from './client'
import type { RootStoreSummary, RootStoreAnchorList } from '@/types/api'

export function listRootStores(): Promise<RootStoreSummary[]> {
  return api.get<RootStoreSummary[]>('/root-stores')
}

export function listRootStoreAnchors(
  storeId: string,
  page: number,
  pageSize: number,
  q: string,
): Promise<RootStoreAnchorList> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (q) params.set('q', q)
  return api.get<RootStoreAnchorList>(`/root-stores/${storeId}/anchors?${params}`)
}
