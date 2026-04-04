import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ChevronRight, Tag as TagIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  deleteTagCategory,
  createTag,
  deleteTag,
} from '@/api/tags'
import { isAdmin } from '@/api/client'
import type { CategoryWithTags } from '@/types/api'
import { ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// Create category dialog
// ---------------------------------------------------------------------------

interface CreateCategoryDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function CreateCategoryDialog({ open, onClose, onCreated }: CreateCategoryDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) { setName(''); setDescription(''); setError('') }
  }, [open])

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return }
    setSubmitting(true)
    setError('')
    try {
      await createTagCategory(name.trim(), description.trim() || undefined)
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create category')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Tag Category</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Environment"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Description <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="cat-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Deployment environments like Production, Staging, Dev"
              rows={2}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Create tag dialog
// ---------------------------------------------------------------------------

interface CreateTagDialogProps {
  open: boolean
  categoryId: string
  categoryName: string
  onClose: () => void
  onCreated: () => void
}

function CreateTagDialog({ open, categoryId, categoryName, onClose, onCreated }: CreateTagDialogProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) { setName(''); setError('') }
  }, [open])

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return }
    setSubmitting(true)
    setError('')
    try {
      await createTag(categoryId, name.trim())
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create tag')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Tag in "{categoryName}"</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
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
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Category row
// ---------------------------------------------------------------------------

interface CategoryRowProps {
  category: CategoryWithTags
  admin: boolean
  onAddTag: (cat: CategoryWithTags) => void
  onDeleteTag: (tagId: string, tagName: string) => void
  onDeleteCategory: (cat: CategoryWithTags) => void
}

function CategoryRow({ category, admin, onAddTag, onDeleteTag, onDeleteCategory }: CategoryRowProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          className="flex items-center gap-2 flex-1 text-left"
          onClick={() => setExpanded(e => !e)}
        >
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          <span className="font-medium">{category.name}</span>
          {category.description && (
            <span className="text-sm text-muted-foreground">— {category.description}</span>
          )}
          <Badge variant="secondary" className="ml-1">{category.tags.length}</Badge>
        </button>
        {admin && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => onAddTag(category)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add tag
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => onDeleteCategory(category)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t px-4 py-3">
          {category.tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tags yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {category.tags.map(tag => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                >
                  {tag.name}
                  {admin && (
                    <button
                      className="ml-0.5 text-muted-foreground hover:text-destructive"
                      onClick={() => onDeleteTag(tag.id, tag.name)}
                      aria-label={`Delete tag ${tag.name}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TagsPage() {
  const [categories, setCategories] = useState<CategoryWithTags[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showCreateCategory, setShowCreateCategory] = useState(false)
  const [addTagTo, setAddTagTo] = useState<CategoryWithTags | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'tag'; id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const admin = isAdmin()

  const load = useCallback(async () => {
    try {
      setCategories(await listTagCategories())
    } catch {
      setError('Failed to load tag categories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.type === 'category') {
        await deleteTagCategory(deleteTarget.id)
      } else {
        await deleteTag(deleteTarget.id)
      }
      setDeleteTarget(null)
      load()
    } catch {
      // leave dialog open so user sees the error via reload
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
  if (error) return <div className="py-8 text-center text-sm text-destructive">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Organize endpoints with categories and tags — assign environments, owners, applications, and more.
          </p>
        </div>
        {admin && (
          <Button onClick={() => setShowCreateCategory(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Category
          </Button>
        )}
      </div>

      {categories.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <TagIcon className="h-10 w-10 opacity-30" />
          <p className="text-sm">No tag categories yet. Create one to get started.</p>
          {admin && (
            <Button variant="outline" onClick={() => setShowCreateCategory(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Category
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map(cat => (
            <CategoryRow
              key={cat.id}
              category={cat}
              admin={admin}
              onAddTag={setAddTagTo}
              onDeleteTag={(id, name) => setDeleteTarget({ type: 'tag', id, name })}
              onDeleteCategory={c => setDeleteTarget({ type: 'category', id: c.id, name: c.name })}
            />
          ))}
        </div>
      )}

      <CreateCategoryDialog
        open={showCreateCategory}
        onClose={() => setShowCreateCategory(false)}
        onCreated={load}
      />

      {addTagTo && (
        <CreateTagDialog
          open={true}
          categoryId={addTagTo.id}
          categoryName={addTagTo.name}
          onClose={() => setAddTagTo(null)}
          onCreated={load}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTarget?.type === 'category' ? 'category' : 'tag'} "{deleteTarget?.name}"?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget?.type === 'category'
              ? 'This will also delete all tags in this category and remove them from any endpoints.'
              : 'This will remove the tag from all endpoints it is currently assigned to.'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
