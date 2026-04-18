import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, MoreVertical } from 'lucide-react'
import StrixEmpty from '@/components/StrixEmpty'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  listTagCategories,
  createTagCategory,
  updateTagCategory,
  deleteTagCategory,
  createTag,
  updateTag,
  deleteTag,
} from '@/api/tags'
import { can } from '@/api/client'
import type { CategoryWithTags, Tag, TagCategory } from '@/types/api'
import { ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyStr(v: string | null | undefined): string {
  return v ?? ''
}

// ---------------------------------------------------------------------------
// Category dialog
// ---------------------------------------------------------------------------

interface CategoryDialogProps {
  open: boolean
  initial?: TagCategory | null
  onClose: () => void
  onSaved: () => void
}

function CategoryDialog({ open, initial, onClose, onSaved }: CategoryDialogProps) {
  const isEdit = Boolean(initial)
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    if (open) { setName(initial?.name ?? ''); setDescription(emptyStr(initial?.description)); setError('') }
  }, [open, initial])

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return }
    setSubmitting(true); setError('')
    try {
      if (isEdit && initial) await updateTagCategory(initial.id, name.trim(), description.trim() || null)
      else await createTagCategory(name.trim(), description.trim() || undefined)
      onSaved(); onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save category')
    } finally { setSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Category' : 'New Category'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="e.g. Environment" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea id="cat-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Deployment environment this endpoint belongs to" rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save' : 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Tag dialog
// ---------------------------------------------------------------------------

interface TagDialogProps {
  open: boolean
  initial?: Tag | null
  categories: TagCategory[]
  defaultCategoryId?: string
  onClose: () => void
  onSaved: () => void
}

function TagDialog({ open, initial, categories, defaultCategoryId, onClose, onSaved }: TagDialogProps) {
  const isEdit = Boolean(initial)
  const [categoryId, setCategoryId]   = useState('')
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    if (open) {
      setCategoryId(initial?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? '')
      setName(initial?.name ?? '')
      setDescription(emptyStr(initial?.description))
      setError('')
    }
  }, [open, initial, defaultCategoryId, categories])

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return }
    if (!categoryId) { setError('Category is required'); return }
    setSubmitting(true); setError('')
    try {
      if (isEdit && initial) await updateTag(initial.id, name.trim(), description.trim() || null)
      else await createTag(categoryId, name.trim(), description.trim() || undefined)
      onSaved(); onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save tag')
    } finally { setSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Tag' : 'New Tag'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="tag-name">Name</Label>
            <Input id="tag-name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="e.g. Production" autoFocus />
          </div>
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="tag-cat">Category</Label>
              <select
                id="tag-cat"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="tag-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea id="tag-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Live production environment" rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save' : 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete confirm dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  open: boolean
  label: string
  warning?: string
  onClose: () => void
  onConfirm: () => Promise<void>
}

function DeleteDialog({ open, label, warning, onClose, onConfirm }: DeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)

  async function handleConfirm() {
    setDeleting(true)
    try { await onConfirm() } finally { setDeleting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete "{label}"?</DialogTitle></DialogHeader>
        {warning && <p className="text-sm text-muted-foreground">{warning}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Tags grid
// ---------------------------------------------------------------------------

const TAGS_GRID = 'grid-cols-[1.5fr_1fr_2fr_2.5rem]'
const TAGS_GRID_READONLY = 'grid-cols-[1.5fr_1fr_2fr]'

interface TagsTableProps {
  categories: CategoryWithTags[]
  admin: boolean
  onEdit: (tag: Tag) => void
  onDelete: (tag: Tag, categoryName: string) => void
  onNew: () => void
  isFetching?: boolean
  isLoading?: boolean
}

function TagsTable({ categories, admin, onEdit, onDelete, onNew, isFetching, isLoading }: TagsTableProps) {
  const rows = categories.flatMap(cat => cat.tags.map(tag => ({ ...tag, categoryName: cat.name })))
  const grid = admin ? TAGS_GRID : TAGS_GRID_READONLY

  return (
    <div className="space-y-4">
      {admin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onNew}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Tag
          </Button>
        </div>
      )}
      <div className="rounded-xl bg-card overflow-hidden">
        <div className={`grid ${grid} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</span>
          {admin && <span />}
        </div>
        {rows.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            <StrixEmpty message="No tags yet." />
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {rows.map(tag => (
              <div key={tag.id} className={`grid ${grid} items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0`}>
                <div className="min-w-0 pt-0.5">
                  <span className="text-sm font-semibold truncate block">{tag.name}</span>
                </div>
                <div className="min-w-0 pt-0.5">
                  <span className="text-sm text-muted-foreground truncate block">{tag.categoryName}</span>
                </div>
                <div className="min-w-0 pt-0.5">
                  <span className="text-sm text-muted-foreground truncate block">
                    {tag.description ?? <span className="italic text-muted-foreground/50">—</span>}
                  </span>
                </div>
                {admin && (
                  <div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(tag)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(tag, tag.categoryName)}>
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Categories grid
// ---------------------------------------------------------------------------

const CATS_GRID = 'grid-cols-[1.5fr_3fr_2.5rem]'
const CATS_GRID_READONLY = 'grid-cols-[1.5fr_3fr]'

interface CategoriesTableProps {
  categories: CategoryWithTags[]
  admin: boolean
  onEdit: (cat: TagCategory) => void
  onDelete: (cat: TagCategory) => void
  onNew: () => void
  isFetching?: boolean
  isLoading?: boolean
}

function CategoriesTable({ categories, admin, onEdit, onDelete, onNew, isFetching, isLoading }: CategoriesTableProps) {
  const grid = admin ? CATS_GRID : CATS_GRID_READONLY

  return (
    <div className="space-y-4">
      {admin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onNew}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Category
          </Button>
        </div>
      )}
      <div className="rounded-xl bg-card overflow-hidden">
        <div className={`grid ${grid} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</span>
          {admin && <span />}
        </div>
        {categories.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            <StrixEmpty message="No categories yet." />
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {categories.map(cat => (
              <div key={cat.id} className={`grid ${grid} items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0`}>
                <div className="min-w-0 pt-0.5">
                  <span className="text-sm font-semibold truncate block">{cat.name}</span>
                </div>
                <div className="min-w-0 pt-0.5">
                  <span className="text-sm text-muted-foreground truncate block">
                    {cat.description ?? <span className="italic text-muted-foreground/50">—</span>}
                  </span>
                </div>
                {admin && (
                  <div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(cat)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(cat)}>
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type TabValue = 'tags' | 'categories'

export default function TagsPage() {
  const [tab, setTab] = useState<TabValue>('tags')
  const [tagDialog, setTagDialog]   = useState<{ open: boolean; tag?: Tag | null }>({ open: false })
  const [catDialog, setCatDialog]   = useState<{ open: boolean; cat?: TagCategory | null }>({ open: false })
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean; label: string; warning?: string; onConfirm: () => Promise<void>
  }>({ open: false, label: '', onConfirm: async () => {} })

  const admin = can('tags:edit')

  const { data: categoriesData, isLoading, isFetching, error: fetchError, refetch } = useQuery({
    queryKey: ['tag-categories'],
    queryFn: listTagCategories,
    placeholderData: keepPreviousData,
  })
  const categories: CategoryWithTags[] = categoriesData ?? []

  function openDeleteDialog(label: string, warning: string | undefined, onConfirm: () => Promise<void>) {
    setDeleteDialog({ open: true, label, warning, onConfirm })
  }

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
  if (fetchError) return <div className="py-8 text-center text-sm text-destructive">{fetchError.message}</div>

  const categoryList: TagCategory[] = categories.map(c => ({
    id: c.id, name: c.name, description: c.description ?? null, createdAt: c.createdAt,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tags</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Organize endpoints with categories and tags — environments, owners, applications, and more.
        </p>
      </div>

      <div className="inline-flex rounded-md border overflow-hidden">
        <button
          onClick={() => setTab('tags')}
          className={`px-5 py-1.5 text-sm font-medium transition-colors ${tab === 'tags' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`}
        >
          Tags
        </button>
        <button
          onClick={() => setTab('categories')}
          className={`px-5 py-1.5 text-sm font-medium border-l transition-colors ${tab === 'categories' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground'}`}
        >
          Categories
        </button>
      </div>

      {tab === 'tags' ? (
        <TagsTable
          categories={categories}
          admin={admin}
          isFetching={isFetching}
          isLoading={isLoading}
          onNew={() => setTagDialog({ open: true, tag: null })}
          onEdit={tag => setTagDialog({ open: true, tag })}
          onDelete={(tag, _catName) => openDeleteDialog(
            tag.name,
            'This will remove the tag from all endpoints it is currently assigned to.',
            async () => { await deleteTag(tag.id); setDeleteDialog(d => ({ ...d, open: false })); refetch() },
          )}
        />
      ) : (
        <CategoriesTable
          categories={categories}
          admin={admin}
          isFetching={isFetching}
          isLoading={isLoading}
          onNew={() => setCatDialog({ open: true, cat: null })}
          onEdit={cat => setCatDialog({ open: true, cat })}
          onDelete={cat => openDeleteDialog(
            cat.name,
            'This will also delete all tags in this category and remove them from any endpoints.',
            async () => { await deleteTagCategory(cat.id); setDeleteDialog(d => ({ ...d, open: false })); refetch() },
          )}
        />
      )}

      <TagDialog
        open={tagDialog.open}
        initial={tagDialog.tag}
        categories={categoryList}
        onClose={() => setTagDialog({ open: false })}
        onSaved={refetch}
      />
      <CategoryDialog
        open={catDialog.open}
        initial={catDialog.cat}
        onClose={() => setCatDialog({ open: false })}
        onSaved={refetch}
      />
      <DeleteDialog
        open={deleteDialog.open}
        label={deleteDialog.label}
        warning={deleteDialog.warning}
        onClose={() => setDeleteDialog(d => ({ ...d, open: false }))}
        onConfirm={deleteDialog.onConfirm}
      />
    </div>
  )
}
