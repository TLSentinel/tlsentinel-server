import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { getMe, updateMe, getMyTagSubscriptions, setMyTagSubscriptions, rotateCalendarToken } from '@/api/users'
import { listTagCategories } from '@/api/tags'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { User, CategoryWithTags } from '@/types/api'

// ---------------------------------------------------------------------------
// Category section
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  category: CategoryWithTags
  selectedTagIds: Set<string>
  disabled: boolean
  onToggleTag: (tagId: string) => void
  onToggleAll: (categoryId: string, tagIds: string[], selectAll: boolean) => void
}

function CategorySection({ category, selectedTagIds, disabled, onToggleTag, onToggleAll }: CategorySectionProps) {
  const tagIds = category.tags.map(t => t.id)
  const selectedCount = tagIds.filter(id => selectedTagIds.has(id)).length
  const allSelected = selectedCount === tagIds.length && tagIds.length > 0
  const someSelected = selectedCount > 0 && !allSelected

  const [expanded, setExpanded] = useState(someSelected || allSelected)
  const initialised = useRef(false)

  // Expand automatically when a tag in this category becomes selected for
  // the first time (e.g. after initial load from the server).
  useEffect(() => {
    if (!initialised.current && (someSelected || allSelected)) {
      setExpanded(true)
      initialised.current = true
    }
  }, [someSelected, allSelected])

  const selectAllCheckboxRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  return (
    <div className="rounded-md border">
      {/* Category header */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setExpanded(e => !e)}
        className={cn(
          'flex w-full items-center justify-between px-4 py-3 text-left transition-colors',
          disabled ? 'cursor-default opacity-50' : 'hover:bg-muted/40',
        )}
      >
        <div className="flex items-center gap-3">
          <input
            ref={selectAllCheckboxRef}
            type="checkbox"
            checked={allSelected}
            disabled={disabled}
            onClick={e => e.stopPropagation()}
            onChange={() => onToggleAll(category.id, tagIds, !allSelected)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm font-medium">{category.name}</span>
          {selectedCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {selectedCount}/{tagIds.length}
            </span>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>

      {/* Tags */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-2">
          {category.tags.map(tag => (
            <label
              key={tag.id}
              className={cn(
                'flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors select-none',
                disabled ? 'cursor-default opacity-50' : 'cursor-pointer hover:bg-muted/40',
              )}
            >
              <input
                type="checkbox"
                checked={selectedTagIds.has(tag.id)}
                disabled={disabled}
                onChange={() => onToggleTag(tag.id)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              {tag.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AccountNotificationsPage() {
  const [user, setUser]               = useState<User | null>(null)
  const [notify, setNotify]           = useState(false)
  const [categories, setCategories]   = useState<CategoryWithTags[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [filterMode, setFilterMode]         = useState<'all' | 'tags'>('all')

  const [calendarToken, setCalendarToken] = useState<string | null>(null)
  const [rotating, setRotating]           = useState(false)

  const [savingNotify, setSavingNotify]   = useState(false)
  const [savingTags, setSavingTags]       = useState(false)
  const [notifyError, setNotifyError]     = useState<string | null>(null)
  const [tagsError, setTagsError]         = useState<string | null>(null)
  const [notifySuccess, setNotifySuccess] = useState(false)
  const [tagsSuccess, setTagsSuccess]     = useState(false)

  const { data: meData } = useQuery({ queryKey: ['me'], queryFn: getMe })
  const { data: tagCategoriesData } = useQuery({ queryKey: ['tag-categories'], queryFn: listTagCategories })
  const { data: tagSubsData } = useQuery({ queryKey: ['my-tag-subscriptions'], queryFn: getMyTagSubscriptions })

  useEffect(() => {
    if (!meData) return
    setUser(meData)
    setNotify(meData.notify)
    setCalendarToken(meData.calendarToken ?? null)
  }, [meData])

  useEffect(() => {
    if (!tagCategoriesData) return
    setCategories(tagCategoriesData.filter(c => c.tags.length > 0))
  }, [tagCategoriesData])

  useEffect(() => {
    if (!tagSubsData) return
    setSelectedTagIds(new Set(tagSubsData.map(s => s.id)))
    setFilterMode(tagSubsData.length > 0 ? 'tags' : 'all')
  }, [tagSubsData])

  const feedUrl = calendarToken
    ? `${window.location.origin}/api/v1/calendar/u/${calendarToken}/feed.ics`
    : ''

  async function generateCalendarToken() {
    setRotating(true)
    try {
      const res = await rotateCalendarToken()
      setCalendarToken(res.calendarToken)
    } finally {
      setRotating(false)
    }
  }

  // ── Notify toggle ──────────────────────────────────────────────────────────

  async function saveNotify(value: boolean) {
    if (!user) return
    setSavingNotify(true)
    setNotifyError(null)
    setNotifySuccess(false)
    try {
      const updated = await updateMe({
        notify: value,
        firstName: user.firstName ?? undefined,
        lastName:  user.lastName  ?? undefined,
        email:     user.email     ?? undefined,
      })
      setUser(updated)
      setNotify(updated.notify)
      setNotifySuccess(true)
      setTimeout(() => setNotifySuccess(false), 3000)
    } catch {
      setNotifyError('Failed to save notification preference.')
      setNotify(!value) // revert
    } finally {
      setSavingNotify(false)
    }
  }

  // ── Tag subscription helpers ───────────────────────────────────────────────

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  function toggleAll(_categoryId: string, tagIds: string[], selectAll: boolean) {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      if (selectAll) tagIds.forEach(id => next.add(id))
      else tagIds.forEach(id => next.delete(id))
      return next
    })
  }

  async function saveTags() {
    setSavingTags(true)
    setTagsError(null)
    setTagsSuccess(false)
    try {
      const ids = filterMode === 'all' ? [] : Array.from(selectedTagIds)
      const updated = await setMyTagSubscriptions(ids)
      setSelectedTagIds(new Set(updated.map(s => s.id)))
      setTagsSuccess(true)
      setTimeout(() => setTagsSuccess(false), 3000)
    } catch {
      setTagsError('Failed to save notification scope.')
    } finally {
      setSavingTags(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/account" className="hover:text-foreground">My Account</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Notifications</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Control whether you receive alert emails and which endpoints you care about.
        </p>
      </div>

      {/* ── Notification scope ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Scope</CardTitle>
          <CardDescription>
            Receive alerts for all endpoints, or narrow scope by selecting specific tags.
            Applies to both email alerts and your calendar feed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            {(['all', 'tags'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  filterMode === mode
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:bg-muted/40 text-foreground',
                )}
              >
                <div className={cn(
                  'h-3.5 w-3.5 rounded-full border-2 transition-colors',
                  filterMode === mode ? 'border-primary bg-primary' : 'border-muted-foreground',
                )} />
                {mode === 'all' ? 'All endpoints' : 'Filter by tags'}
              </button>
            ))}
          </div>

          {/* Tag checkboxes — only shown in filter mode */}
          {filterMode === 'tags' && (
            categories.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                No tags have been configured yet. Tags can be created in Settings → Tags.
              </p>
            ) : (
              <div className="space-y-2">
                {categories.map(cat => (
                  <CategorySection
                    key={cat.id}
                    category={cat}
                    selectedTagIds={selectedTagIds}
                    disabled={false}
                    onToggleTag={toggleTag}
                    onToggleAll={toggleAll}
                  />
                ))}
              </div>
            )
          )}

          {tagsError   && <p className="text-sm text-destructive">{tagsError}</p>}
          {tagsSuccess && <p className="text-sm text-green-600">Notification scope saved.</p>}

          <div className="flex justify-end">
            <Button onClick={saveTags} disabled={savingTags}>
              {savingTags ? 'Saving…' : 'Save scope'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Alert email toggle ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Emails</CardTitle>
          <CardDescription>
            Receive certificate expiry and scan error alerts by email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="acc-notify">Receive alert emails</Label>
              <p className="text-xs text-muted-foreground">
                {user?.email
                  ? 'Alerts will be sent to ' + user.email + '.'
                  : 'Requires an email address on your profile.'}
              </p>
            </div>
            <Switch
              id="acc-notify"
              checked={notify}
              disabled={!user?.email || savingNotify}
              onCheckedChange={saveNotify}
            />
          </div>
          {notifyError  && <p className="text-sm text-destructive">{notifyError}</p>}
          {notifySuccess && <p className="text-sm text-green-600">Saved.</p>}
        </CardContent>
      </Card>

      {/* ── Calendar feed ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Calendar Feed</CardTitle>
          <CardDescription>
            Subscribe to a live .ics feed in Outlook, Google Calendar, or any iCal-compatible app.
            Respects your notification scope above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {calendarToken ? (
            <>
              <div className="flex gap-2">
                <Input readOnly value={feedUrl} className="font-mono text-xs" />
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(feedUrl)}>
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Regenerating will invalidate the current URL — you'll need to re-subscribe in your calendar app.
              </p>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={generateCalendarToken} disabled={rotating}>
                  {rotating ? 'Regenerating…' : 'Regenerate'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No feed URL generated yet. Click below to create one.
              </p>
              <div className="flex justify-end">
                <Button onClick={generateCalendarToken} disabled={rotating}>
                  {rotating ? 'Generating…' : 'Generate Feed URL'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
