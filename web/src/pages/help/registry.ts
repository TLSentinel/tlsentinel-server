// Frontmatter schema for in-app help docs. Keep minimal — add fields here when
// the help surface needs them (e.g. a per-doc icon name).
export interface HelpDocFrontmatter {
  title: string
  blurb?: string
  category?: string
  order?: number
}

export interface HelpDoc extends Required<Pick<HelpDocFrontmatter, 'title'>> {
  slug: string
  blurb: string
  category: string
  order: number
  body: string
}

// Bundle every .md file under ./content at build time. `?raw` hands us the
// file contents as a string; `eager: true` inlines them so the registry is
// synchronous. HMR works — edit an MD file and the page updates live.
const raw = import.meta.glob('./content/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function slugOf(path: string): string {
  return path.split('/').pop()!.replace(/\.md$/, '')
}

// Tiny frontmatter parser — only understands the keys in HelpDocFrontmatter
// (scalar strings and the numeric `order`). We avoid pulling in `gray-matter`
// because it ships a yaml engine that uses `eval` and trips CSP/bundler
// warnings for no value here — our needs are simpler than real YAML.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

function parseFrontmatter(src: string): { data: Partial<HelpDocFrontmatter>; content: string } {
  const m = FRONTMATTER_RE.exec(src)
  if (!m) return { data: {}, content: src }
  const data: Record<string, string | number> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim()
    let value: string = line.slice(colon + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key === 'order' && /^-?\d+$/.test(value)) {
      data[key] = parseInt(value, 10)
    } else {
      data[key] = value
    }
  }
  return { data: data as Partial<HelpDocFrontmatter>, content: m[2] }
}

export const helpDocs: HelpDoc[] = Object.entries(raw)
  .map(([path, src]) => {
    const { data, content } = parseFrontmatter(src)
    const slug = slugOf(path)
    if (!data.title) {
      throw new Error(`help doc ${slug}.md is missing required "title" frontmatter`)
    }
    return {
      slug,
      title: data.title,
      blurb: data.blurb ?? '',
      category: data.category ?? 'Topics',
      order: data.order ?? 999,
      body: content,
    }
  })
  .sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title))

export function findHelpDoc(slug: string): HelpDoc | undefined {
  return helpDocs.find(d => d.slug === slug)
}
