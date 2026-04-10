import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
// Category dialog (create + edit)
// ---------------------------------------------------------------------------

interface CategoryDialogProps {
  open: boolean
  initial?: TagCategory | null
  onClose: () => void
  onSaved: () => void
}

function CategoryDialog({ open, initial, onClose, onSaved }: CategoryDialogProps) {
  const isEdit = Boolean(initial)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setDescription(emptyStr(initial?.description))
      setError('')
    }
  }, [open, initial])

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return }
    setSubmitting(true)
    setError('')
    try {
      if (isEdit && initial) {
        await updateTagCategory(initial.id, name.trim(), description.trim() || null)
      } else {
        await createTagCategory(name.trim(), description.trim() || undefined)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save category')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Category' : 'New Category'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Environment"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="cat-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Deployment environment this endpoint belongs to"
              rows={2}
            />
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
// Tag dialog (create + edit)
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
  const [categoryId, setCategoryId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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
    setSubmitting(true)
    setError('')
    try {
      if (isEdit && initial) {
        await updateTag(initial.id, name.trim(), description.trim() || null)
      } else {
        await createTag(categoryId, name.trim(), description.trim() || undefined)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save tag')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Tag' : 'New Tag'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="tag-name">Name</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Production"
              autoFocus
            />
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
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="tag-desc">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="tag-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Live production environment"
              rows={2}
            />
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
        <DialogHeader>
          <DialogTitle>Delete "{label}"?</DialogTitle>
        </DialogHeader>
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
// Tags table
// ---------------------------------------------------------------------------

interface TagsTableProps {
  categories: CategoryWithTags[]
  admin: boolean
  onEdit: (tag: Tag) => void
  onDelete: (tag: Tag, categoryName: string) => void
  onNew: () => void
}

function TagsTable({ categories, admin, onEdit, onDelete, onNew }: TagsTableProps) {
  // Flatten all tags with their category name for the table
  const rows = categories.flatMap(cat =>
    cat.tags.map(tag => ({ ...tag, categoryName: cat.name }))
  )

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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Description</TableHead>
            {admin && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr]:border-b-0">
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={admin ? 4 : 3} className="py-10 text-center text-sm text-muted-foreground">
                No tags yet. Create a category first, then add tags.
              </TableCell>
            </TableRow>
          ) : (
            rows.map(tag => (
              <TableRow key={tag.id}>
                <TableCell className="font-medium">{tag.name}</TableCell>
                <TableCell className="text-muted-foreground">{tag.categoryName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {tag.description ?? <span className="italic text-muted-foreground/50">—</span>}
                </TableCell>
                {admin && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        onClick={() => onEdit(tag)}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit {tag.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(tag, tag.categoryName)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete {tag.name}</span>
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Categories table
// ---------------------------------------------------------------------------

interface CategoriesTableProps {
  categories: CategoryWithTags[]
  admin: boolean
  onEdit: (cat: TagCategory) => void
  onDelete: (cat: TagCategory) => void
  onNew: () => void
}

function CategoriesTable({ categories, admin, onEdit, onDelete, onNew }: CategoriesTableProps) {
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            {admin && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr]:border-b-0">
          {categories.length === 0 ? (
            <TableRow>
              <TableCell colSpan={admin ? 3 : 2} className="py-10 text-center text-sm text-muted-foreground">
                No categories yet.
              </TableCell>
            </TableRow>
          ) : (
            categories.map(cat => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">{cat.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {cat.description ?? <span className="italic text-muted-foreground/50">—</span>}
                </TableCell>
                {admin && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        onClick={() => onEdit(cat)}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit {cat.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(cat)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete {cat.name}</span>
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type TabValue = 'tags' | 'categories'

export default function TagsPage() {
  const [tab, setTab] = useState<TabValue>('tags')

  // Tag dialog state
  const [tagDialog, setTagDialog] = useState<{ open: boolean; tag?: Tag | null }>({ open: false })
  // Category dialog state
  const [catDialog, setCatDialog] = useState<{ open: boolean; cat?: TagCategory | null }>({ open: false })
  // Delete dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    label: string
    warning?: string
    onConfirm: () => Promise<void>
  }>({ open: false, label: '', onConfirm: async () => {} })

  const admin = can('tags:edit')

  const { data: categoriesData, isLoading, error: fetchError, refetch } = useQuery({
    queryKey: ['tag-categories'],
    queryFn: listTagCategories,
  })
  const categories: CategoryWithTags[] = categoriesData ?? []

  function openDeleteDialog(label: string, warning: string | undefined, onConfirm: () => Promise<void>) {
    setDeleteDialog({ open: true, label, warning, onConfirm })
  }

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
  if (fetchError) return <div className="py-8 text-center text-sm text-destructive">{fetchError.message}</div>

  // Flatten categories to TagCategory[] for the tag dialog dropdown
  const categoryList: TagCategory[] = categories.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    createdAt: c.createdAt,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Tags</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Organize endpoints with categories and tags — environments, owners, applications, and more.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="inline-flex rounded-md border overflow-hidden">
        <button
          onClick={() => setTab('tags')}
          className={`px-5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'tags'
              ? 'bg-foreground text-background'
              : 'bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          Tags
        </button>
        <button
          onClick={() => setTab('categories')}
          className={`px-5 py-1.5 text-sm font-medium border-l transition-colors ${
            tab === 'categories'
              ? 'bg-foreground text-background'
              : 'bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          Categories
        </button>
      </div>

      {/* Tables */}
      {tab === 'tags' ? (
        <TagsTable
          categories={categories}
          admin={admin}
          onNew={() => setTagDialog({ open: true, tag: null })}
          onEdit={tag => setTagDialog({ open: true, tag })}
          onDelete={(tag, _catName) => openDeleteDialog(
            tag.name,
            `This will remove the tag from all endpoints it is currently assigned to.`,
            async () => { await deleteTag(tag.id); setDeleteDialog(d => ({ ...d, open: false })); refetch() },
          )}
        />
      ) : (
        <CategoriesTable
          categories={categories}
          admin={admin}
          onNew={() => setCatDialog({ open: true, cat: null })}
          onEdit={cat => setCatDialog({ open: true, cat })}
          onDelete={cat => openDeleteDialog(
            cat.name,
            `This will also delete all tags in this category and remove them from any endpoints.`,
            async () => { await deleteTagCategory(cat.id); setDeleteDialog(d => ({ ...d, open: false })); refetch() },
          )}
        />
      )}

      {/* Dialogs */}
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
