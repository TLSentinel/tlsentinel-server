import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Archive } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getScanHistoryRetention, setScanHistoryRetention } from '@/api/settings'

export default function MaintenancePage() {
  const [days, setDays]           = useState(90)
  const [saving, setSaving]       = useState(false)
  const [running, setRunning]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    getScanHistoryRetention().then(r => setDays(r.days)).catch(() => {})
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const r = await setScanHistoryRetention(days)
      setDays(r.days)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setSaveError('Failed to save retention setting.')
    } finally {
      setSaving(false)
    }
  }

  function handleRun() {
    setRunning(true)
    setTimeout(() => setRunning(false), 1500) // placeholder until API exists
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Maintenance</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Maintenance</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Database housekeeping tasks. These also run automatically on a nightly schedule.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-muted-foreground" />
            Purge Scan History
          </CardTitle>
          <CardDescription>
            Remove scan history records older than the retention window. The most recent
            entry per endpoint is always kept regardless of age.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="shrink-0" htmlFor="retention-days">Retain history for</Label>
            <Input
              id="retention-days"
              type="number"
              min={1}
              max={3650}
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>

          {saveError   && <p className="text-sm text-destructive">{saveError}</p>}
          {saveSuccess && <p className="text-sm text-green-600">Saved.</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="destructive" onClick={handleRun} disabled={running}>
              {running ? 'Running…' : 'Run Now'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
