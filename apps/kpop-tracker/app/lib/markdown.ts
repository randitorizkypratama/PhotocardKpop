/**
 * A deliberately tiny Markdown renderer for article bodies.
 *
 * The body comes from a model, so it is untrusted: everything is HTML-escaped
 * *before* any markup is added, which means the only tags that can ever reach
 * `v-html` are the ones produced right here. It supports exactly what the
 * rewrite prompt asks for — `##`/`###` headings, paragraphs, `-` lists and
 * `**bold**` / `*italic*` / `` `code` `` — and nothing else.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

export function renderMarkdown(markdown: string): string {
  const source = escapeHtml(String(markdown || '').replace(/\r\n/g, '\n')).trim()
  if (!source) return ''

  const out: string[] = []
  let paragraph: string[] = []
  let list: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    out.push(`<p>${inline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (!list.length) return
    out.push(`<ul>${list.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`)
    list = []
  }

  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      // `#` maps to h2: the page already owns the h1 (the article title).
      const level = Math.min(4, heading[1]!.length + 1)
      out.push(`<h${level}>${inline(heading[2]!.trim())}</h${level}>`)
      continue
    }

    const item = /^[-*]\s+(.*)$/.exec(line)
    if (item) {
      flushParagraph()
      list.push(item[1]!.trim())
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()
  return out.join('\n')
}
