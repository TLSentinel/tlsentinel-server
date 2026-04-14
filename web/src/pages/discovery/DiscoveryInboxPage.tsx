import { Inbox } from 'lucide-react'

export default function DiscoveryInboxPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
      <Inbox className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium">Discovery inbox coming soon</p>
    </div>
  )
}
