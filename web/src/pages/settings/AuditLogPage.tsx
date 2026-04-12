import { useEffect, useRef, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { listAuditLogs } from '@/api/audit'
import type { AuditLog } from '@/types/api'
import SearchInput from '@/components/SearchInput'
import TablePagination from '@/components/TablePagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
  auth: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  endpoint: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  certificate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  scanner: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  user: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  group: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  settings: 'bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300',
  me: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
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
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit-logs', page, debouncedSearch],
    queryFn: () => listAuditLogs(page, PAGE_SIZE, debouncedSearch),
    placeholderData: keepPreviousData,
  })
  const logs: AuditLog[] = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/logs" className="hover:text-foreground transition-colors">Logs</Link>
        <span>/</span>
        <span className="text-foreground">Audit</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Audit Log</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Record of logins, configuration changes, and administrative actions.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter by username…"
          className="max-w-sm flex-1"
        />
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">Time</TableHead>
            <TableHead className="w-36">User</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead className="w-36 hidden md:table-cell">IP Address</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className={`[&_tr]:border-b-0 transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                Loading…
              </TableCell>
            </TableRow>
          ) : logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                No audit log entries found.
              </TableCell>
            </TableRow>
          ) : logs.map(log => (
            <TableRow key={log.id}>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDate(log.createdAt)}
              </TableCell>
              <TableCell className="text-sm font-medium">
                {log.username || <span className="text-muted-foreground italic">system</span>}
              </TableCell>
              <TableCell>
                <ActionBadge action={log.action} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {log.resourceType ? (
                  <span>{log.resourceType}{log.resourceId ? ` / ${log.resourceId}` : ''}</span>
                ) : '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                {log.ipAddress ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
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
