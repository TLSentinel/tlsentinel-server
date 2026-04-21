import { Link } from 'react-router-dom'
import { ExternalLink, Gauge, BookOpen, Github, Info, Keyboard, Landmark, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Breadcrumb } from '@/components/Breadcrumb'
import { helpDocs } from './registry'

// ---------------------------------------------------------------------------
// Help landing page. Serves as a table of contents for in-app topics plus
// pointers to external resources (Swagger, GitHub).
//
// Keep entries genuine — only link to things that exist. As more help topics
// get written, add them to INTERNAL_TOPICS.
// ---------------------------------------------------------------------------

interface TopicEntry {
  title: string
  blurb: string
  icon: LucideIcon
  to?: string
  href?: string
}

// Hand-curated entries for destinations that aren't served from markdown
// (e.g. the About page). New help content should prefer a markdown file in
// ./content/ — those are merged in automatically below.
const HAND_TOPICS: TopicEntry[] = [
  {
    title: 'About TLSentinel',
    blurb: 'Version, license, and third-party attributions.',
    icon: Info,
    to: '/settings/about',
  },
]

// Per-slug icon override for MD docs. Unlisted slugs fall back to BookOpen.
// Kept as a map (rather than a frontmatter field) so we don't have to ship
// a runtime name->lucide lookup for what's a handful of entries.
const MD_ICONS: Record<string, LucideIcon> = {
  'scoring':     Gauge,
  'root-stores': Landmark,
}

// Auto-generated entries from ./content/*.md via the registry.
const MD_TOPICS: TopicEntry[] = helpDocs.map(d => ({
  title: d.title,
  blurb: d.blurb,
  icon: MD_ICONS[d.slug] ?? BookOpen,
  to: `/help/${d.slug}`,
}))

const INTERNAL_TOPICS: TopicEntry[] = [...MD_TOPICS, ...HAND_TOPICS]

const EXTERNAL_TOPICS: TopicEntry[] = [
  {
    title: 'API reference',
    blurb: 'Interactive Swagger UI for the REST API — every endpoint, request shape, and response schema.',
    icon: BookOpen,
    href: '/api-docs/index.html',
  },
  {
    title: 'GitHub repository',
    blurb: 'Source code, issues, and release notes.',
    icon: Github,
    href: 'https://github.com/tlsentinel/tlsentinel-server',
  },
]

function TopicCard({ entry }: { entry: TopicEntry }) {
  const Icon = entry.icon
  const external = !!entry.href
  const content = (
    <div className="group flex h-full gap-4 rounded-lg border border-border p-5 transition-colors hover:border-primary/40 hover:bg-accent/30">
      <div className="shrink-0 rounded-md bg-muted p-2.5 text-muted-foreground group-hover:text-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">{entry.title}</h3>
          {external && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{entry.blurb}</p>
      </div>
    </div>
  )
  if (external) {
    return (
      <a href={entry.href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {content}
      </a>
    )
  }
  return <Link to={entry.to!} className="block h-full">{content}</Link>
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
      {children}
    </kbd>
  )
}

export default function HelpPage() {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const modKey = isMac ? '⌘' : 'Ctrl'

  return (
    <div className="max-w-4xl space-y-8">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Dashboard', to: '/dashboard' },
        { label: 'Help' },
      ]} />

      {/* Title */}
      <div>
        <h1 className="text-2xl font-semibold">Help</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          In-app documentation and pointers to the API reference and source code.
        </p>
      </div>

      {/* In-app topics */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Topics</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {INTERNAL_TOPICS.map(t => (
            <TopicCard key={t.title} entry={t} />
          ))}
        </div>
      </section>

      {/* External resources */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">References</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {EXTERNAL_TOPICS.map(t => (
            <TopicCard key={t.title} entry={t} />
          ))}
        </div>
      </section>

      {/* Keyboard shortcuts */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Keyboard className="h-4 w-4" />
          Keyboard shortcuts
        </h2>
        <div className="rounded-lg border border-border">
          <dl className="divide-y divide-border">
            <div className="flex items-center justify-between px-5 py-3">
              <dt className="flex items-center gap-2 text-sm">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                Focus global search
              </dt>
              <dd className="flex items-center gap-1 text-sm text-muted-foreground">
                <Kbd>{modKey}</Kbd>
                <span>+</span>
                <Kbd>K</Kbd>
              </dd>
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <dt className="text-sm">Navigate search results</dt>
              <dd className="flex items-center gap-1 text-sm text-muted-foreground">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                <span className="mx-1">·</span>
                <Kbd>Enter</Kbd>
                <span>to select</span>
                <span className="mx-1">·</span>
                <Kbd>Esc</Kbd>
                <span>to close</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  )
}
