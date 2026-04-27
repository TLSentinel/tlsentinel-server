import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Design token: small uppercase label style used for field labels, section headers, breadcrumbs. */
export const FIELD_LABEL = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Returns `word` pluralized based on count. Optionally supply a custom plural form. */
export function plural(count: number, word: string, pluralForm?: string): string {
  return count === 1 ? word : (pluralForm ?? `${word}s`)
}

export function fmtDays(days: number): string {
  if (days < 0) return `${Math.abs(days)}d ago`
  if (days === 0) return 'Today'
  return `${days}d`
}