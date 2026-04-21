import { api } from './client'
import type { SearchResults } from '@/types/api'

export function universalSearch(q: string): Promise<SearchResults> {
  return api.get<SearchResults>(`/search?q=${encodeURIComponent(q)}`)
}
