import { api } from './client'

export interface AlertThresholdsResponse {
  thresholds: number[]
}

export function getAlertThresholds(): Promise<AlertThresholdsResponse> {
  return api.get<AlertThresholdsResponse>('/settings/alert-thresholds')
}

export function setAlertThresholds(thresholds: number[]): Promise<AlertThresholdsResponse> {
  return api.put<AlertThresholdsResponse>('/settings/alert-thresholds', { thresholds })
}
