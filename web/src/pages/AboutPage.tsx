import { useState, useEffect, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ExternalLink, ChevronDown } from 'lucide-react'
import { getVersion } from '@/api/version'
import type { BuildInfo } from '@/types/api'

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

const SECTION_CARD  = 'rounded-lg border bg-card p-5 space-y-4'
const SECTION_TITLE = 'text-base font-semibold'
const FIELD_LABEL   = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const LINK_BODY     = 'inline-flex items-center gap-1 text-primary hover:underline'
const MIT_LICENSE   = `MIT License

Copyright (c) 2026 TLSentinel Contributors

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
SOFTWARE.`

// ---------------------------------------------------------------------------
// Third-party library attributions
// ---------------------------------------------------------------------------

interface LibEntry {
  name: string
  license: string
  url: string
}

const BACKEND_LIBS: LibEntry[] = [
  { name: 'uptrace/bun',              license: 'BSD-2-Clause', url: 'https://github.com/uptrace/bun' },
  { name: 'lib/pq',                   license: 'MIT',          url: 'https://github.com/lib/pq' },
  { name: 'go-chi/chi',               license: 'MIT',          url: 'https://github.com/go-chi/chi' },
  { name: 'golang-jwt/jwt',           license: 'MIT',          url: 'https://github.com/golang-jwt/jwt' },
  { name: 'coreos/go-oidc',           license: 'Apache-2.0',   url: 'https://github.com/coreos/go-oidc' },
  { name: 'golang.org/x/oauth2',      license: 'BSD-3-Clause', url: 'https://cs.opensource.google/go/x/oauth2' },
  { name: 'golang-migrate/migrate',   license: 'MIT',          url: 'https://github.com/golang-migrate/migrate' },
  { name: 'swaggo/swag',              license: 'MIT',          url: 'https://github.com/swaggo/swag' },
  { name: 'swaggo/http-swagger',      license: 'MIT',          url: 'https://github.com/swaggo/http-swagger' },
  { name: 'netresearch/go-cron',      license: 'MIT',          url: 'https://github.com/netresearch/go-cron' },
  { name: 'arran4/golang-ical',       license: 'MIT',          url: 'https://github.com/arran4/golang-ical' },
  { name: 'joho/godotenv',            license: 'MIT',          url: 'https://github.com/joho/godotenv' },
  { name: 'golang.org/x/crypto',      license: 'BSD-3-Clause', url: 'https://cs.opensource.google/go/x/crypto' },
  { name: 'github.com/caarlos0/env',  license: 'MIT',          url: 'https://github.com/caarlos0/env' },
]

// Upstream sources of the CA trust data TLSentinel validates against. The
// CCADB is the mechanical data source; the four root programs are the
// decision-makers whose inclusion lists CCADB aggregates. Keep this list in
// sync with internal/rootstore/refresh.go.
const CA_DATA_SOURCES: LibEntry[] = [
  { name: 'Common CA Database (CCADB)',    license: 'Attribution', url: 'https://www.ccadb.org' },
  { name: 'Apple Root Certificate Program', license: 'Apple',       url: 'https://www.apple.com/certificateauthority/ca_program.html' },
  { name: 'Chrome Root Program',            license: 'Google',      url: 'https://g.co/chrome/root-policy' },
  { name: 'Microsoft Trusted Root Program', license: 'Microsoft',   url: 'https://learn.microsoft.com/en-us/security/trusted-root/program-requirements' },
  { name: 'Mozilla CA Certificate Program', license: 'MPL-2.0',     url: 'https://wiki.mozilla.org/CA' },
]

const FRONTEND_LIBS: LibEntry[] = [
  { name: 'React',                       license: 'MIT',     url: 'https://react.dev' },
  { name: 'Vite',                        license: 'MIT',     url: 'https://vitejs.dev' },
  { name: 'React Router',                license: 'MIT',     url: 'https://reactrouter.com' },
  { name: 'Tailwind CSS',                license: 'MIT',     url: 'https://tailwindcss.com' },
  { name: '@tailwindcss/typography',     license: 'MIT',     url: 'https://github.com/tailwindlabs/tailwindcss-typography' },
  { name: 'shadcn/ui',                   license: 'MIT',     url: 'https://ui.shadcn.com' },
  { name: 'Radix UI',                    license: 'MIT',     url: 'https://www.radix-ui.com' },
  { name: 'class-variance-authority',    license: 'MIT',     url: 'https://cva.style' },
  { name: 'tailwind-merge',              license: 'MIT',     url: 'https://github.com/dcastil/tailwind-merge' },
  { name: 'clsx',                        license: 'MIT',     url: 'https://github.com/lukeed/clsx' },
  { name: 'Lucide React',                license: 'ISC',     url: 'https://lucide.dev' },
  { name: '@fontsource-variable/geist',   license: 'OFL-1.1', url: 'https://fontsource.org/fonts/geist' },
  { name: '@tanstack/react-query',        license: 'MIT',     url: 'https://tanstack.com/query' },
  { name: 'react-markdown',              license: 'MIT',     url: 'https://github.com/remarkjs/react-markdown' },
  { name: '@peculiar/x509',              license: 'MIT',     url: 'https://github.com/PeculiarVentures/x509' },
]

interface LibSection {
  label: string
  libs: LibEntry[]
}

function LibTable({ sections }: { sections: LibSection[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Library</th>
            <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground w-28">License</th>
          </tr>
        </thead>
        <tbody>
          {sections.map(({ label, libs }) => (
            <Fragment key={label}>
              <tr className="border-b bg-muted/20">
                <td colSpan={2} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </td>
              </tr>
              {libs.map((lib) => (
                <tr key={lib.name} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <a
                      href={lib.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs hover:text-primary hover:underline"
                    >
                      {lib.name}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{lib.license}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AboutPage() {
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null)
  const [showLicense, setShowLicense] = useState(false)

  useEffect(() => {
    getVersion().then(setBuildInfo).catch(() => {})
  }, [])

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">About</span>
      </nav>

      {/* Mascot + title */}
      <div className="flex items-end gap-5">
        <img
          src="/strix.png"
          alt="Strix the TLSentinel owl"
          className="w-36 select-none"
          draggable={false}
        />
        <div className="pb-1">
          <h1 className="text-2xl font-semibold">TLSentinel</h1>
          <p className="text-sm text-muted-foreground mt-0.5">TLS certificate monitoring</p>
        </div>
      </div>

      {/* Version info */}
      <div className={SECTION_CARD}>
        <h2 className={SECTION_TITLE}>Build Information</h2>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3">
          <dt className={FIELD_LABEL}>Version</dt>
          <dd className="font-mono text-sm">{buildInfo?.version ?? '—'}</dd>
          <dt className={FIELD_LABEL}>Commit</dt>
          <dd className="font-mono text-sm">{buildInfo?.commit ?? '—'}</dd>
          <dt className={FIELD_LABEL}>Build time</dt>
          <dd className="font-mono text-sm">{buildInfo?.buildTime ?? '—'}</dd>
        </dl>
      </div>

      {/* License + source */}
      <div className={SECTION_CARD}>
        <h2 className={SECTION_TITLE}>License &amp; Source</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center rounded-md border bg-muted/40 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            MIT
          </span>
          <a
            href="https://github.com/tlsentinel/tlsentinel-server"
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_BODY}
          >
            github.com/tlsentinel/tlsentinel-server
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => setShowLicense(v => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showLicense ? 'rotate-180' : ''}`} />
          {showLicense ? 'Hide license text' : 'Show license text'}
        </button>
        {showLicense && (
          <pre className="rounded-md bg-muted px-4 py-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {MIT_LICENSE}
          </pre>
        )}
      </div>

      {/* Scoring methodology */}
      <div className={SECTION_CARD}>
        <h2 className={SECTION_TITLE}>Scoring Methodology</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The TLS grade on endpoint detail pages follows the{' '}
          <a
            href="https://github.com/ssllabs/research/wiki/SSL-Server-Rating-Guide"
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_BODY}
          >
            SSL Labs SSL Server Rating Guide
            <ExternalLink className="h-3 w-3" />
          </a>
          {' '}by Qualys, applied to the data our scanner captures. See{' '}
          <Link to="/help/scoring" className="text-primary hover:underline">
            how the TLS score is calculated
          </Link>
          {' '}for the specifics and current limitations.
        </p>
      </div>

      {/* Trust store data sources */}
      <div className={SECTION_CARD}>
        <h2 className={SECTION_TITLE}>Trust Store Data</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          TLSentinel derives its root anchor sets from the{' '}
          <a
            href="https://www.ccadb.org"
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_BODY}
          >
            Common CA Database
            <ExternalLink className="h-3 w-3" />
          </a>
          , which aggregates the four major root programs. All upstream data is
          publicly published and redistributed under each program's own terms.
        </p>
        <LibTable sections={[{ label: 'Root programs', libs: CA_DATA_SOURCES }]} />
      </div>

      {/* Third-party attributions */}
      <div className={SECTION_CARD}>
        <h2 className={SECTION_TITLE}>Third-Party Libraries</h2>
        <LibTable sections={[
          { label: 'Backend (Go)', libs: BACKEND_LIBS },
          { label: 'Frontend',     libs: FRONTEND_LIBS },
        ]} />
      </div>
    </div>
  )
}
