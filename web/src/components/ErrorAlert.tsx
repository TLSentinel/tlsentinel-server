import type { ReactNode, ComponentType } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type IconComponent = ComponentType<{ className?: string }>

export function ErrorAlert({
  children,
  icon: Icon = AlertCircle,
  className,
}: {
  children: ReactNode
  icon?: IconComponent
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive',
        className,
      )}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
