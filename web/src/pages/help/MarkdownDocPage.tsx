import { useParams } from 'react-router-dom'
import { Breadcrumb } from '@/components/Breadcrumb'
import NotFoundPage from '@/pages/NotFoundPage'
import { findHelpDoc } from './registry'
import { MarkdownContent } from './MarkdownContent'

// Renders a single help doc identified by its filename slug
// (e.g. /help/root-stores -> src/pages/help/content/root-stores.md).
//
// Doc title and body come from the bundled MD file; breadcrumb and page
// chrome live here so the docs themselves stay pure content.
export default function MarkdownDocPage() {
  const { slug } = useParams<{ slug: string }>()
  const doc = slug ? findHelpDoc(slug) : undefined

  if (!doc) {
    return <NotFoundPage />
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Breadcrumb items={[
        { label: 'Dashboard', to: '/dashboard' },
        { label: 'Help', to: '/help' },
        { label: doc.title },
      ]} />
      <MarkdownContent body={doc.body} />
    </div>
  )
}
