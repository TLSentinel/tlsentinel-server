import { api } from './client'
import type {
  TOTPLoginRequest,
  TOTPSetup,
  TOTPStatus,
  TOTPVerifyResponse,
} from '@/types/api'
import type { LoginResponse } from '@/types/api'

export function getTOTPStatus(): Promise<TOTPStatus> {
  return api.get<TOTPStatus>('/me/totp')
}

/** Generates (or regenerates) a TOTP secret. Pending until /me/totp/verify is called. */
export function beginTOTPSetup(): Promise<TOTPSetup> {
  return api.post<TOTPSetup>('/me/totp/setup', {})
}

/** Confirms a pending TOTP enrollment. Returns the one-time recovery codes. */
export function confirmTOTPSetup(code: string): Promise<TOTPVerifyResponse> {
  return api.post<TOTPVerifyResponse>('/me/totp/verify', { code })
}

/**
 * Disables TOTP for the signed-in user. Requires the account password
 * AND a current TOTP code (or recovery code) — both must be valid.
 */
export function disableTOTP(password: string, code: string): Promise<void> {
  return api.delete<void>('/me/totp', { password, code })
}

/** Issues a fresh batch of recovery codes; the previous batch becomes invalid. */
export function regenerateTOTPRecoveryCodes(code: string): Promise<TOTPVerifyResponse> {
  return api.post<TOTPVerifyResponse>('/me/totp/recovery-codes', { code })
}

/** Completes the second-step login by exchanging a challenge token + code for a session JWT. */
export function loginWithTOTP(req: TOTPLoginRequest): Promise<LoginResponse> {
  return api.post<LoginResponse>('/auth/totp', req)
}
