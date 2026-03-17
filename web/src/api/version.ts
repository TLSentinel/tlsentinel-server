import { api } from './client'
import type { BuildInfo } from '@/types/api'

export function getVersion(): Promise<BuildInfo> {
  return api.get<BuildInfo>('/version')
}
