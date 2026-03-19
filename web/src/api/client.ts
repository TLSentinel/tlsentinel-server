import { ApiError } from '@/types/api'

const BASE = '/api/v1'

// ---------------------------------------------------------------------------
// Token storage — kept in memory for the session; survives page reload via
// localStorage only if the user checks "remember me" (future feature).
// ---------------------------------------------------------------------------
let _token: string | null = localStorage.getItem('token')

export function setToken(token: string): void {
  _token = token
  localStorage.setItem('token', token)
}

export function clearToken(): void {
  _token = null
  localStorage.removeItem('token')
}

export function hasToken(): boolean {
  return _token !== null
}

export interface TokenIdentity {
  uid: string
  sub: string
  role: string
  given_name?: string
  family_name?: string
}

/** Returns true when the current user has the admin role. */
export function isAdmin(): boolean {
  return getIdentity()?.role === 'admin'
}

/** Decodes the JWT payload without verifying the signature (client-side display only). */
export function getIdentity(): TokenIdentity | null {
  if (!_token) return null
  try {
    const payload = _token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as TokenIdentity
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    // The Go server returns plain-text error messages.
    const text = await res.text()
    throw new ApiError(res.status, text.trim() || res.statusText)
  }

  // No body responses (204, or any 2xx without a JSON content-type).
  if (!res.headers.get('content-type')?.includes('application/json')) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

// Convenience methods
export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
