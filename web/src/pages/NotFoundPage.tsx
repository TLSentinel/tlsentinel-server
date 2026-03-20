import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
      <img
        src="/strix.png"
        alt="Strix the owl looking confused"
        className="w-36 opacity-80 select-none"
        draggable={false}
      />
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">HOO sent you?</h1>
        <p className="text-sm text-muted-foreground">
          I've searched every branch. This page doesn't exist.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/dashboard">Back to Dashboard</Link>
      </Button>
    </div>
  )
}
