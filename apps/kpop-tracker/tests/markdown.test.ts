import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../app/lib/markdown'

/**
 * The article body is model output rendered with `v-html`, so the renderer must
 * be escape-first: nothing in the input may survive as a tag.
 */

describe('article markdown rendering', () => {
  it('turns paragraphs, headings and lists into markup', () => {
    const html = renderMarkdown('Paragraf pertama.\n\n## Sub Judul\n\n- satu\n- dua\n\nParagraf terakhir.')
    expect(html).toContain('<p>Paragraf pertama.</p>')
    expect(html).toContain('<h3>Sub Judul</h3>')
    expect(html).toContain('<ul><li>satu</li><li>dua</li></ul>')
    expect(html).toContain('<p>Paragraf terakhir.</p>')
  })

  it('joins wrapped lines into one paragraph', () => {
    expect(renderMarkdown('baris satu\nbaris dua')).toBe('<p>baris satu baris dua</p>')
  })

  it('escapes HTML instead of executing it', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders bold, italic and inline code', () => {
    const html = renderMarkdown('Ini **penting** dan *miring* serta `kode`.')
    expect(html).toContain('<strong>penting</strong>')
    expect(html).toContain('<em>miring</em>')
    expect(html).toContain('<code>kode</code>')
  })

  it('escapes quotes so user text cannot become an attribute', () => {
    const html = renderMarkdown('Judul " onmouseover="alert(1)')
    // No raw quote survives, so the text can never close an attribute.
    expect(html).not.toContain('"')
    expect(html).toContain('&quot;')
  })

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown('   \n  ')).toBe('')
  })
})
