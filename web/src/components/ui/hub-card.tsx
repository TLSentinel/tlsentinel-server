import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export type HubCardTone =
  | 'red'
  | 'orange'
  | 'amber'
  | 'green'
  | 'teal'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'pink'
  | 'slate'

const TONE_STYLES: Record<HubCardTone, string> = {
  red:    'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400',
  orange: 'bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400',
  amber:  'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
  green:  'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  teal:   'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400',
  blue:   'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
  indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400',
  violet: 'bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400',
  purple: 'bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400',
  pink:   'bg-pink-100 text-pink-600 dark:bg-pink-950/50 dark:text-pink-400',
  slate:  'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

interface HubCardProps {
  icon: React.ReactNode
  title: string
  description: string
  to?: string
  soon?: boolean
  tone?: HubCardTone
}

export function HubCard({ icon, title, description, to, soon, tone }: HubCardProps) {
  const inner = tone ? (
    <div
      className={[
        'group relative rounded-xl border bg-card p-6 flex flex-col gap-4 h-full transition-colors',
        to ? 'cursor-pointer hover:bg-muted/50' : 'opacity-60',
      ].join(' ')}
    >
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${TONE_STYLES[tone]}`}>
        {icon}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold text-foreground">{title}</span>
          {soon && <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {to && !soon && (
        <ChevronRight className="absolute right-5 top-6 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </div>
  ) : (
    <div
      className={[
        'group rounded-xl bg-card p-5 flex flex-col gap-3 h-full transition-colors',
        to ? 'cursor-pointer hover:bg-muted' : 'opacity-60',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-muted-foreground">
          {icon}
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {soon
          ? <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
          : <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        }
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )

  return to ? <Link to={to} className="h-full">{inner}</Link> : inner
}
