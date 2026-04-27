import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

// Reusable prose renderer for our Markdown help docs. Wraps react-markdown
// with the conventions we want:
//
//   - GitHub-flavored Markdown (tables, strikethrough, task lists).
//   - Internal links (paths starting with "/") route through react-router so
//     we don't lose app state; external links open in a new tab.
//   - Styling via @tailwindcss/typography's `prose` class (already wired in
//     index.css via `@plugin "@tailwindcss/typography"`).
//
// This component is also the renderer we'll reuse for in-line contextual
// help — e.g. <HelpPopover slug="..." /> wrapping a Popover around this.
const components: Components = {
  a({ href, children, ...rest }) {
    if (href && href.startsWith('/')) {
      // react-router Link doesn't accept all anchor props; pass through what
      // matters (className, title) but drop anchor-specific ones we don't need.
      const { className, title } = rest as { className?: string; title?: string }
      return <Link to={href} className={className} title={title}>{children}</Link>
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    )
  },
}

export function MarkdownContent({ body, className }: { body: string; className?: string }) {
  return (
    <article className={cn('prose prose-slate dark:prose-invert max-w-none', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </article>
  )
}
