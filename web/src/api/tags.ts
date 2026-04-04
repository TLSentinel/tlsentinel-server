import { api } from './client'
import type { CategoryWithTags, TagCategory, Tag, TagWithCategory } from '@/types/api'

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function listTagCategories(): Promise<CategoryWithTags[]> {
  return api.get<CategoryWithTags[]>('/tags/categories')
}

export function createTagCategory(name: string, description?: string): Promise<TagCategory> {
  return api.post<TagCategory>('/tags/categories', { name, description })
}

export function deleteTagCategory(categoryId: string): Promise<void> {
  return api.delete<void>(`/tags/categories/${categoryId}`)
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export function createTag(categoryId: string, name: string): Promise<Tag> {
  return api.post<Tag>('/tags', { categoryId, name })
}

export function deleteTag(tagId: string): Promise<void> {
  return api.delete<void>(`/tags/${tagId}`)
}

// ---------------------------------------------------------------------------
// Endpoint tags
// ---------------------------------------------------------------------------

export function getEndpointTags(endpointId: string): Promise<TagWithCategory[]> {
  return api.get<TagWithCategory[]>(`/endpoints/${endpointId}/tags`)
}

export function setEndpointTags(endpointId: string, tagIds: string[]): Promise<void> {
  return api.put<void>(`/endpoints/${endpointId}/tags`, { tagIds })
}
