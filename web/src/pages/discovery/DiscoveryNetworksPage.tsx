import { Network } from 'lucide-react'

export default function DiscoveryNetworksPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
      <Network className="h-10 w-10 opacity-20" />
      <p className="text-sm font-medium">Network discovery coming soon</p>
    </div>
  )
}
