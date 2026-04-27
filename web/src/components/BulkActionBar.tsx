import { CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// BulkActionBar — compact inline pill that surfaces bulk actions on a table
// once one or more rows are selected. Intended to sit at the trailing edge
// of a filter/toolbar row (`ml-auto`), invisible until selection > 0.
//
// Reusable across list pages: knows nothing about endpoints / hosts / certs.
// Callers supply the concrete actions; the table context makes "Selected"
// unambiguous without a per-page noun.
// ---------------------------------------------------------------------------

export type BulkAction = {
  label:     string
  onClick:   () => void
  variant?:  'default' | 'outline' | 'destructive'
  disabled?: boolean
}

type Props = {
  count:      number
  onClear:    () => void
  actions:    BulkAction[]
  className?: string
}

export default function BulkActionBar({ count, onClear, actions, className }: Props) {
  if (count === 0) return null

  return (
    <div
      role="toolbar"
      aria-label={`Bulk actions, ${count} selected`}
      className={`inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 pl-3 pr-2 py-1.5 dark:border-blue-900/60 dark:bg-blue-950/40 ${className ?? ''}`}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-blue-300">
        <CheckCircle2 className="h-4 w-4" />
        <span className="tabular-nums">{count}</span>
        <span>Selected</span>
      </span>

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="rounded p-0.5 text-blue-600/70 hover:bg-blue-100 hover:text-blue-700 dark:text-blue-300/70 dark:hover:bg-blue-900/40 dark:hover:text-blue-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="ml-1 flex items-center gap-1.5">
        {actions.map(action => (
          <Button
            key={action.label}
            size="sm"
            variant={action.variant ?? 'outline'}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
