import DOMPurify from 'dompurify'
import { marked } from 'marked'

// Render trusted-ish Markdown (the Coach's replies) to SANITIZED HTML. The text
// comes from the LLM, so we always run it through DOMPurify to strip any script/
// event-handler injection before it reaches v-html. Client-only (DOMPurify needs
// the DOM); on the server we fall back to the raw text.

marked.setOptions({
  breaks: true, // treat single newlines as <br> — chat-friendly
  gfm: true, // tables, strikethrough, task lists
})

// The Coach wraps every card it names in [[Card Name]] (English). Turn those into
// hoverable spans BEFORE markdown parsing so the rest renders normally. The
// CoachChat component wires hover → big card preview onto these spans.
const CARD_TAG = /\[\[([^[\]]{1,80})\]\]/g
function markCards(src: string): string {
  return src.replace(CARD_TAG, (_, name: string) => {
    const clean = name.trim()
    // Escape the name for the attribute/text (avoid breaking the HTML/markdown).
    const safe = clean.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<span class="coach-card" data-card="${safe}">${safe}</span>`
  })
}

export function useMarkdown() {
  function render(src: string): string {
    if (!src)
      return ''
    if (!import.meta.client)
      return src
    const html = marked.parse(markCards(src), { async: false }) as string
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'del',
        'code',
        'pre',
        'blockquote',
        'ul',
        'ol',
        'li',
        'a',
        'h1',
        'h2',
        'h3',
        'h4',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'hr',
        'span',
      ],
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class', 'data-card'],
    })
  }
  return { render }
}
