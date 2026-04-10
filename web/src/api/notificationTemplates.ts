import { api } from './client'

export interface TemplateVariable {
  name: string
  description: string
}

export interface NotificationTemplate {
  eventType: string
  channel: string
  label: string
  subject: string | null
  body: string
  format: string // "html" | "text"
  isCustom: boolean
  variables: TemplateVariable[]
}

export function listNotificationTemplates(): Promise<NotificationTemplate[]> {
  return api.get<NotificationTemplate[]>('/notification-templates')
}

export function getNotificationTemplate(eventType: string, channel: string): Promise<NotificationTemplate> {
  return api.get<NotificationTemplate>(`/notification-templates/${eventType}/${channel}`)
}

export function updateNotificationTemplate(
  eventType: string,
  channel: string,
  subject: string | null,
  body: string,
  format: string,
): Promise<NotificationTemplate> {
  return api.put<NotificationTemplate>(`/notification-templates/${eventType}/${channel}`, { subject, body, format })
}

export function resetNotificationTemplate(eventType: string, channel: string): Promise<void> {
  return api.delete(`/notification-templates/${eventType}/${channel}`)
}
