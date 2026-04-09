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

export interface ScanHistoryRetentionResponse {
  days: number
}

export function getScanHistoryRetention(): Promise<ScanHistoryRetentionResponse> {
  return api.get<ScanHistoryRetentionResponse>('/maintenance/scan-history-retention')
}

export function setScanHistoryRetention(days: number): Promise<ScanHistoryRetentionResponse> {
  return api.put<ScanHistoryRetentionResponse>('/maintenance/scan-history-retention', { days })
}

export interface ScheduledJob {
  name: string
  displayName: string
  cronExpression: string
  enabled: boolean
  lastRunAt: string | null
  lastRunStatus: string | null
}

export function getScheduledJobs(): Promise<ScheduledJob[]> {
  return api.get<ScheduledJob[]>('/maintenance/scheduled-jobs')
}

export function updateScheduledJob(name: string, cronExpression: string, enabled: boolean): Promise<ScheduledJob> {
  return api.put<ScheduledJob>(`/maintenance/scheduled-jobs/${name}`, { cronExpression, enabled })
}

export interface PurgeScanHistoryResponse {
  deleted: number
}

export function runPurgeScanHistory(): Promise<PurgeScanHistoryResponse> {
  return api.post<PurgeScanHistoryResponse>('/maintenance/run/purge-scan-history')
}

export interface AuditLogRetentionResponse {
  days: number
}

export function getAuditLogRetention(): Promise<AuditLogRetentionResponse> {
  return api.get<AuditLogRetentionResponse>('/maintenance/audit-log-retention')
}

export function setAuditLogRetention(days: number): Promise<AuditLogRetentionResponse> {
  return api.put<AuditLogRetentionResponse>('/maintenance/audit-log-retention', { days })
}

export interface PurgeAuditLogsResponse {
  deleted: number
}

export function runPurgeAuditLogs(): Promise<PurgeAuditLogsResponse> {
  return api.post<PurgeAuditLogsResponse>('/maintenance/run/purge-audit-logs')
}

export interface PurgeExpiryAlertsResponse {
  deleted: number
}

export function runPurgeExpiryAlerts(): Promise<PurgeExpiryAlertsResponse> {
  return api.post<PurgeExpiryAlertsResponse>('/maintenance/run/purge-expiry-alerts')
}
