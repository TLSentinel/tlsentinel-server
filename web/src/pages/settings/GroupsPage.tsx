import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { listGroups, deleteGroup } from '@/api/groups'
import type { Group } from '@/types/api'
import StrixEmpty from '@/components/StrixEmpty'
import TablePagination from '@/components/TablePagination'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Pencil, Trash2, MoreVertical, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 20
const ROW_GRID = 'grid-cols-[1.5fr_2fr_2.5rem]'

export default function GroupsPage() {
  const navigate = useNavigate()
  const [page, setPage]                 = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null)
  const [deleting, setDeleting]         = useState(false)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['groups', page],
    queryFn: () => listGroups(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  })
  const groups: Group[]  = data?.items ?? []
  const total            = data?.totalCount ?? 0
  const totalPages       = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart       = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd         = Math.min(page * PAGE_SIZE, total)

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteGroup(deleteTarget.id)
      setDeleteTarget(null)
      if (groups.length === 1 && page > 1) setPage(p => p - 1)
      else refetch()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Groups</span>
      </nav>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Groups</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage notification and access groups.
          </p>
        </div>
        <Button size="sm" onClick={() => navigate('/settings/groups/new')}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Group
        </Button>
      </div>

      <div className="rounded-lg border">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-sm text-muted-foreground">
            {total === 0 ? 'No groups' : `Showing ${rangeStart}–${rangeEnd} of ${total} ${total === 1 ? 'group' : 'groups'}`}
          </p>
        </div>

        {/* Column headers */}
        <div className={`grid ${ROW_GRID} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</span>
          <span />
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            <StrixEmpty message="No groups yet." />
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {groups.map(g => (
              <div key={g.id} className={`grid ${ROW_GRID} items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0`}>
                <div className="min-w-0 pt-0.5">
                  <span className="text-sm font-semibold truncate block">{g.name}</span>
                </div>
                <div className="min-w-0 pt-0.5">
                  <span className="text-sm text-muted-foreground truncate block">{g.description ?? '—'}</span>
                </div>
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/settings/groups/${g.id}/edit`)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(g)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <TablePagination
        page={page}
        totalPages={totalPages}
        totalCount={total}
        onPrev={() => setPage(p => p - 1)}
        onNext={() => setPage(p => p + 1)}
        noun="group"
      />

      <Dialog open={deleteTarget !== null} onOpenChange={v => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
