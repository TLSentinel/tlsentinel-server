import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Shield, ChevronRight, ExternalLink } from 'lucide-react'
import { getVersion } from '@/api/version'
import type { BuildInfo } from '@/types/api'

// ---------------------------------------------------------------------------
// Third-party library attributions
// ---------------------------------------------------------------------------

interface LibEntry {
  name: string
  license: string
  url: string
}

const BACKEND_LIBS: LibEntry[] = [
  { name: 'uptrace/bun',         license: 'BSD-2-Clause', url: 'https://github.com/uptrace/bun' },
  { name: 'go-chi/chi',          license: 'MIT',          url: 'https://github.com/go-chi/chi' },
  { name: 'golang-jwt/jwt',      license: 'MIT',          url: 'https://github.com/golang-jwt/jwt' },
  { name: 'swaggo/swag',         license: 'MIT',          url: 'https://github.com/swaggo/swag' },
  { name: 'swaggo/http-swagger', license: 'MIT',          url: 'https://github.com/swaggo/http-swagger' },
  { name: 'netresearch/go-cron', license: 'MIT',          url: 'https://github.com/netresearch/go-cron' },
  { name: 'golang.org/x/crypto', license: 'BSD-3-Clause', url: 'https://cs.opensource.google/go/x/crypto' },
]

const FRONTEND_LIBS: LibEntry[] = [
  { name: 'React',              license: 'MIT', url: 'https://react.dev' },
  { name: 'Vite',               license: 'MIT', url: 'https://vitejs.dev' },
  { name: 'React Router',       license: 'MIT', url: 'https://reactrouter.com' },
  { name: 'Tailwind CSS',       license: 'MIT', url: 'https://tailwindcss.com' },
  { name: 'shadcn/ui',          license: 'MIT', url: 'https://ui.shadcn.com' },
  { name: 'Radix UI',           license: 'MIT', url: 'https://www.radix-ui.com' },
  { name: 'Lucide React',       license: 'ISC', url: 'https://lucide.dev' },
  { name: 'Recharts',           license: 'MIT', url: 'https://recharts.org' },
]

interface LibSection {
  label: string
  libs: LibEntry[]
}

function LibTable({ sections }: { sections: LibSection[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="pb-2 font-medium text-muted-foreground w-1/4">Category</th>
          <th className="pb-2 font-medium text-muted-foreground">Library</th>
          <th className="pb-2 font-medium text-muted-foreground w-28">License</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {sections.flatMap(({ label, libs }) =>
          libs.map((lib, i) => (
            <tr key={lib.name}>
              <td className="py-2 text-muted-foreground text-xs">
                {i === 0 ? label : ''}
              </td>
              <td className="py-2">
                <a
                  href={lib.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs hover:underline"
                >
                  {lib.name}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
              </td>
              <td className="py-2 text-muted-foreground">{lib.license}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AboutPage() {
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null)

  useEffect(() => {
    getVersion().then(setBuildInfo).catch(() => {})
  }, [])

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">About</span>
      </nav>

      {/* Identity */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-sidebar">
          <Shield className="h-6 w-6 text-sidebar-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">TLSentinel</h1>
          <p className="text-sm text-muted-foreground">
            TLS certificate monitoring and alerting
          </p>
        </div>
      </div>

      {/* Version info */}
      <div className="rounded-lg border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Build Information</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-mono">{buildInfo?.version ?? '—'}</dd>
          <dt className="text-muted-foreground">Commit</dt>
          <dd className="font-mono">{buildInfo?.commit ?? '—'}</dd>
          <dt className="text-muted-foreground">Build time</dt>
          <dd className="font-mono">{buildInfo?.buildTime ?? '—'}</dd>
        </dl>
      </div>

      {/* License + source */}
      <div className="rounded-lg border p-5 space-y-3">
        <h2 className="text-sm font-semibold">License &amp; Source</h2>
        <a
          href="https://github.com/tlsentinel/tlsentinel"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        >
          github.com/tlsentinel/tlsentinel
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <pre className="rounded-md bg-muted px-4 py-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">{`MIT License

Copyright (c) 2026 Dennis Koch

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}</pre>
      </div>

      {/* Third-party attributions */}
      <div className="rounded-lg border p-5 space-y-3">
        <h2 className="text-sm font-semibold">Third-Party Libraries</h2>
        <LibTable sections={[
          { label: 'Backend (Go)', libs: BACKEND_LIBS },
          { label: 'Frontend',     libs: FRONTEND_LIBS },
        ]} />
      </div>
    </div>
  )
}
