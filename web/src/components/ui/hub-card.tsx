import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface HubCardProps {
  icon: React.ReactNode
  title: string
  description: string
  to?: string
  soon?: boolean
}

export function HubCard({ icon, title, description, to, soon }: HubCardProps) {
  const inner = (
    <div
      className={[
        'group rounded-lg border p-5 flex flex-col gap-3 h-full transition-colors',
        to
          ? 'cursor-pointer hover:border-foreground/30 hover:bg-accent/30'
          : 'opacity-60',
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
