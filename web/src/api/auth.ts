import { api } from './client'
import type { LoginRequest, LoginResponse } from '@/types/api'

export function login(req: LoginRequest): Promise<LoginResponse> {
  return api.post<LoginResponse>('/auth/login', req)
}
