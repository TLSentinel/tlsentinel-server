import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, X, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getAlertThresholds, setAlertThresholds } from '@/api/settings'
import { ApiError } from '@/types/api'

const DEFAULT_THRESHOLDS = [30, 14, 7, 1]

export default function GeneralSettingsPage() {
  const [thresholds, setThresholds] = useState<number[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    setLoading(true)
    getAlertThresholds()
      .then((r) => setThresholds(r.thresholds))
      .catch(() => setThresholds(DEFAULT_THRESHOLDS))
      .finally(() => setLoading(false))
  }, [])

  function addThreshold() {
    const val = parseInt(input.trim(), 10)
    if (isNaN(val) || val < 1 || val > 365) {
      setError('Enter a value between 1 and 365.')
      return
    }
    if (thresholds.includes(val)) {
      setError(`${val} is already in the list.`)
      return
    }
    setThresholds((prev) => [...prev, val].sort((a, b) => b - a))
    setInput('')
    setError(null)
  }

  function removeThreshold(val: number) {
    setThresholds((prev) => prev.filter((t) => t !== val))
    setError(null)
  }

  async function resetToDefaults() {
    setThresholds([...DEFAULT_THRESHOLDS])
    setError(null)
    setSaving(true)
    setSuccess(false)
    try {
      const result = await setAlertThresholds([...DEFAULT_THRESHOLDS])
      setThresholds(result.thresholds)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reset thresholds.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    if (thresholds.length === 0) {
      setError('At least one threshold is required.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const result = await setAlertThresholds(thresholds)
      setThresholds(result.thresholds)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save thresholds.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">General</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">General</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Global application preferences.
        </p>
      </div>

      {/* Alert Thresholds */}
      <div className="rounded-lg border p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Expiry Alert Thresholds</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Send an alert email when a certificate expires within these many days.
            Each threshold fires once per certificate.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* Current thresholds */}
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {thresholds.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No thresholds configured.</p>
              ) : (
                thresholds.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium"
                  >
                    {t}d
                    <button
                      type="button"
                      onClick={() => removeThreshold(t)}
                      className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      aria-label={`Remove ${t} days`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Add input */}
            <div className="space-y-1.5">
              <Label htmlFor="threshold-input">Add threshold (days)</Label>
              <div className="flex gap-2">
                <Input
                  id="threshold-input"
                  type="number"
                  min={1}
                  max={365}
                  placeholder="e.g. 60"
                  className="w-36"
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setError(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && addThreshold()}
                />
                <Button type="button" variant="outline" size="sm" onClick={addThreshold}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={resetToDefaults}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset to defaults
              </Button>
              {success && (
                <span className="text-sm text-green-600">Saved.</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
