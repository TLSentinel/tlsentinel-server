import { useEffect, useRef, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listAuditLogs } from '@/api/audit'
import type { AuditLog } from '@/types/api'
import SearchInput from '@/components/SearchInput'
import TablePagination from '@/components/TablePagination'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50

function formatAction(action: string): string {
  const labels: Record<string, string> = {
    'auth.login': 'Login',
    'auth.login_failed': 'Login Failed',
    'auth.oidc_login': 'SSO Login',
    'endpoint.create': 'Endpoint Created',
    'endpoint.update': 'Endpoint Updated',
    'endpoint.delete': 'Endpoint Deleted',
    'certificate.ingest': 'Certificate Ingested',
    'certificate.delete': 'Certificate Deleted',
    'scanner.create': 'Scanner Created',
    'scanner.update': 'Scanner Updated',
    'scanner.delete': 'Scanner Deleted',
    'scanner.set_default': 'Scanner Set Default',
    'user.create': 'User Created',
    'user.update': 'User Updated',
    'user.delete': 'User Deleted',
    'user.password_change': 'Password Changed',
    'user.enabled_change': 'User Enable/Disable',
    'me.password_change': 'Password Changed (Self)',
    'group.create': 'Group Created',
    'group.update': 'Group Updated',
    'group.delete': 'Group Deleted',
    'settings.mail_config_update': 'Mail Config Updated',
    'settings.alert_thresholds_update': 'Alert Thresholds Updated',
  }
  return labels[action] ?? action
}

function actionCategory(action: string): string {
  return action.split('.')[0] ?? 'other'
}

const categoryColours: Record<string, string> = {
  auth:        'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  endpoint:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  certificate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  scanner:     'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  user:        'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  group:       'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  settings:    'bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300',
  me:          'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
}

function ActionBadge({ action }: { action: string }) {
  const cat = actionCategory(action)
  const colours = categoryColours[cat] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${colours}`}>
      {formatAction(action)}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ROW_GRID = 'grid-cols-[10rem_8rem_1fr_1fr_8rem]'

export default function AuditLogPage() {
  const [page, setPage]                       = useState(1)
  const [search, setSearch]                   = useState('')
  const debounceRef                           = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit-logs', page, debouncedSearch],
    queryFn:  () => listAuditLogs(page, PAGE_SIZE, debouncedSearch),
    placeholderData: keepPreviousData,
  })
  const logs: AuditLog[] = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd   = Math.min(page * PAGE_SIZE, totalCount)

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/logs" className="hover:text-foreground transition-colors">Logs</Link>
        <span>/</span>
        <span className="text-foreground">Audit</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Record of logins, configuration changes, and administrative actions.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter by username…"
          className="max-w-sm flex-1"
        />
      </div>

      <div className="rounded-xl bg-card overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0
              ? 'No entries'
              : `Showing ${rangeStart}–${rangeEnd} of ${totalCount} entries`}
          </p>
        </div>

        {/* Column headers */}
        <div className={`grid ${ROW_GRID} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Time</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Action</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resource</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">IP Address</span>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No audit log entries found.</div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {logs.map(log => (
              <div key={log.id} className={`grid ${ROW_GRID} items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0`}>
                <div className="pt-0.5">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</span>
                </div>
                <div className="min-w-0 pt-0.5">
                  <span className="text-sm font-medium truncate block">
                    {log.username || <span className="text-muted-foreground italic">system</span>}
                  </span>
                </div>
                <div className="pt-0.5">
                  <ActionBadge action={log.action} />
                </div>
                <div className="min-w-0 pt-0.5">
                  <span className="text-xs text-muted-foreground truncate block">
                    {log.resourceType
                      ? `${log.resourceType}${log.resourceId ? ` / ${log.resourceId}` : ''}`
                      : '—'}
                  </span>
                </div>
                <div className="pt-0.5">
                  <span className="text-xs text-muted-foreground">{log.ipAddress ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <TablePagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPrev={() => setPage(p => Math.max(1, p - 1))}
        onNext={() => setPage(p => Math.min(totalPages, p + 1))}
        noun="entry"
      />
    </div>
  )
}
