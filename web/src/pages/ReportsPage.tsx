import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'

interface ReportCard {
  to: string
  icon: React.ElementType
  title: string
  description: string
}

const REPORTS: ReportCard[] = [
  {
    to: '/reports/tls-posture',
    icon: ShieldCheck,
    title: 'TLS Posture',
    description: 'Protocol versions, cipher suites, and certificate authority breakdown across your fleet.',
  },
]

export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Insights and exports across your monitored endpoints.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="group flex flex-col gap-3 rounded-lg border bg-card p-5 shadow-sm transition-colors hover:border-foreground/30 hover:bg-accent/40"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="font-medium">{title}</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
