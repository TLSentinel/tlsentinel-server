import { BarChart2 } from 'lucide-react'

export default function ReportsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
      <BarChart2 className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium">Reports coming soon</p>
    </div>
  )
}
