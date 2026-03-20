interface StrixEmptyProps {
  message: React.ReactNode
  /** Tailwind width class — defaults to w-20 (80px display). */
  size?: string
}

/**
 * Strix — the TLSentinel owl mascot — shown inside empty states.
 * Drop /strix.png into web/public/ to activate.
 */
export default function StrixEmpty({ message, size = 'w-20' }: StrixEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <img
        src="/strix.png"
        alt="Strix the owl"
        className={`${size} opacity-70 select-none`}
        draggable={false}
      />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
