import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/utils'

interface TablePaginationProps {
  page: number
  totalPages: number
  totalCount: number
  onPrev: () => void
  onNext: () => void
  /** Singular noun used in the count label, e.g. "endpoint" → "3 endpoints". Defaults to "result". */
  noun?: string
}

export default function TablePagination({
  page,
  totalPages,
  totalCount,
  onPrev,
  onNext,
  noun = 'result',
}: TablePaginationProps) {
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {totalCount === 0
          ? `No ${plural(0, noun)}`
          : `Page ${page} of ${totalPages} · ${totalCount} ${plural(totalCount, noun)}`}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={onPrev}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous page</span>
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= totalPages}
          onClick={onNext}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next page</span>
        </Button>
      </div>
    </div>
  )
}
