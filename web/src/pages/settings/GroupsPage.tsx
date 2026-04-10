import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { listGroups, deleteGroup } from '@/api/groups'
import type { Group } from '@/types/api'
import StrixEmpty from '@/components/StrixEmpty'
import TablePagination from '@/components/TablePagination'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
  const groups: Group[] = data?.items ?? []
  const total = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteGroup(deleteTarget.id)
      setDeleteTarget(null)
      // If we deleted the last item on a page > 1, step back
      if (groups.length === 1 && page > 1) {
        setPage(p => p - 1)
      } else {
        refetch()
      }
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
            {total} {total === 1 ? 'group' : 'groups'}
          </p>
        </div>
        <Button size="sm" onClick={() => navigate('/settings/groups/new')}>
          <Plus className="h-4 w-4 mr-1" />
          Add Group
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-[100px]" />
          </TableRow>
        </TableHeader>
        <TableBody className={`[&_tr]:border-b-0 transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">Loading…</TableCell>
            </TableRow>
          ) : groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="py-10 text-center">
                <StrixEmpty message="No groups yet." />
              </TableCell>
            </TableRow>
          ) : groups.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="font-medium">{g.name}</TableCell>
              <TableCell className="text-muted-foreground">{g.description ?? '—'}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => navigate(`/settings/groups/${g.id}/edit`)}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit {g.name}</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(g)}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete {g.name}</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <TablePagination
        page={page}
        totalPages={totalPages}
        totalCount={total}
        onPrev={() => setPage(p => p - 1)}
        onNext={() => setPage(p => p + 1)}
        noun="group"
      />

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
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
