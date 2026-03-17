import { api } from './client'
import type { ResolveResponse } from '@/types/api'

export function resolve(hostname: string): Promise<ResolveResponse> {
  return api.get<ResolveResponse>(`/utils/resolve?hostname=${encodeURIComponent(hostname)}`)
}
