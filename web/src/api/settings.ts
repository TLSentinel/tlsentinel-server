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

export interface ScanHistoryRetentionResponse {
  days: number
}

export function getScanHistoryRetention(): Promise<ScanHistoryRetentionResponse> {
  return api.get<ScanHistoryRetentionResponse>('/settings/scan-history-retention')
}

export function setScanHistoryRetention(days: number): Promise<ScanHistoryRetentionResponse> {
  return api.put<ScanHistoryRetentionResponse>('/settings/scan-history-retention', { days })
}
