import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { FIELD_LABEL, cn } from '@/lib/utils'

export type BreadcrumbItem = { label: ReactNode; to?: string }

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav className={cn('flex items-center gap-1.5', FIELD_LABEL, className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <Fragment key={i}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
            {item.to && !isLast ? (
              <Link to={item.to} className="hover:text-foreground">{item.label}</Link>
            ) : (
              <span className={isLast ? 'text-foreground' : undefined}>{item.label}</span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
