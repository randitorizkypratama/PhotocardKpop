/**
 * Bilingual event vocabulary (§12 — cross-language corroboration).
 *
 * A Korean headline and its English counterpart about the same occurrence
 * rarely share a single *word*: "에스파 '더티워크' 뮤직비디오 1억뷰 돌파" and
 * `aespa's "Dirty Work" Becomes Their 10th MV To Hit 100 Million Views` describe
 * one event and have zero tokens in common. Token overlap alone therefore never
 * links them, component B (independent corroboration) stays at zero, and no
 * story can ever clear the hard gates — which is exactly the state the feed was
 * stuck in.
 *
 * This module closes that gap with a *deterministic* bridge instead of a model:
 * both titles are projected onto a small, hand-curated set of event concepts
 * that exist in both scripts (music shows, charts, awards, milestones, brands),
 * and a shared quoted phrase counts as a subject of its own.
 *
 * Two tiers keep the bridge honest:
 *
 *  - **context** — where/when the story happened (a music show, a chart, a
 *    comeback). Context alone never proves two articles are about one event:
 *    two different wins on the same show share it.
 *  - **subject** — the *which one*: a named award, a view milestone, a brand or
 *    exhibition, or a phrase the publisher itself put in quotes (usually the
 *    song title). A subject is what distinguishes one occurrence from another.
 *
 * So the cross-language rule is deliberately "one of each": a shared context
 * places both articles at the same kind of occurrence, and a shared subject
 * says it is the *same* occurrence. See `dedupe.isSameEvent`.
 *
 * Pure and offline: no network, no AI, no database — the duplicate tests assert
 * the exact merges this table permits.
 */

export interface EventConcept {
  /** Stable identifier, namespaced by kind (`show:`, `award:`, `milestone:`…). */
  id: string
  /** Every spelling of the concept: Latin first, then Hangul. */
  forms: string[]
}

/**
 * Concepts that only place a story in time or space. Never sufficient alone.
 *
 * Music shows and charts live here on purpose: "IVE performed on Music Bank"
 * and "IVE won on Music Bank" are two different stories that share this word.
 */
export const EVENT_CONTEXT_IDS = new Set<string>([
  // Music shows
  'show:musicbank',
  'show:inkigayo',
  'show:mcountdown',
  'show:musiccore',
  'show:showchampion',
  'show:theshow',
  'show:weeklyidol',
  // Charts
  'chart:hanteo',
  'chart:circle',
  'chart:billboard',
  'chart:melon',
  'chart:oricon',
  // Recurring event types
  'event:win',
  'event:comeback',
  'event:release',
  'event:debut',
  'event:concert',
  'event:fanmeeting',
  'event:pictorial',
  'event:interview',
  'event:schedule',
  'event:contract',
  'event:exhibition',
  'event:festival',
  // Media / metrics
  'media:musicvideo',
  'media:performance',
  'metric:views',
])

/**
 * Concepts that name *which* occurrence: the award, the milestone, the brand.
 * At least one of these must be shared before two differently worded headlines
 * may be treated as one event.
 */
export const EVENT_CONCEPTS: EventConcept[] = [
  // ── Music shows (context) ────────────────────────────────────────────────
  { id: 'show:musicbank', forms: ['music bank', '뮤직뱅크'] },
  { id: 'show:inkigayo', forms: ['inkigayo', 'sbs inkigayo', '인기가요'] },
  { id: 'show:mcountdown', forms: ['m countdown', 'mcountdown', '엠카운트다운'] },
  { id: 'show:musiccore', forms: ['music core', '뮤직코어'] },
  { id: 'show:showchampion', forms: ['show champion', '쇼챔피언'] },
  { id: 'show:theshow', forms: ['the show', '더쇼'] },
  { id: 'show:weeklyidol', forms: ['weekly idol', '주간 아이돌'] },

  // ── Charts (context) ─────────────────────────────────────────────────────
  { id: 'chart:hanteo', forms: ['hanteo', '한터차트', '한터'] },
  { id: 'chart:circle', forms: ['circle chart', 'gaon chart', '가온차트'] },
  { id: 'chart:billboard', forms: ['billboard', '빌보드'] },
  { id: 'chart:melon', forms: ['melon chart', '멜론차트'] },
  { id: 'chart:oricon', forms: ['oricon', '오리콘'] },

  // ── Recurring event types (context) ──────────────────────────────────────
  { id: 'event:win', forms: ['1st win', 'first win', '1위', '우승'] },
  { id: 'event:comeback', forms: ['comeback', '컴백'] },
  { id: 'event:release', forms: ['release', 'released', '발매', '발표', '공개'] },
  { id: 'event:debut', forms: ['debut', '데뷔'] },
  { id: 'event:concert', forms: ['concert', 'tour', '콘서트', '투어'] },
  { id: 'event:fanmeeting', forms: ['fan meeting', 'fansign', '팬미팅', '팬싸인'] },
  { id: 'event:pictorial', forms: ['pictorial', '화보'] },
  { id: 'event:interview', forms: ['interview', '인터뷰'] },
  { id: 'event:schedule', forms: ['schedule', '스케줄'] },
  { id: 'event:contract', forms: ['contract', '계약'] },
  { id: 'event:exhibition', forms: ['exhibition', '전시회', '전시'] },
  { id: 'event:festival', forms: ['festival', '페스티벌'] },

  // ── Media / metrics (context) ────────────────────────────────────────────
  { id: 'media:musicvideo', forms: ['music video', 'mv', '뮤직비디오'] },
  { id: 'media:performance', forms: ['performance', 'stage', '무대', '출연'] },
  { id: 'metric:views', forms: ['views', '조회수'] },

  // ── Named subjects ───────────────────────────────────────────────────────
  // View milestones: a number both scripts write differently, so the value is
  // normalised here rather than compared as text.
  { id: 'milestone:views100m', forms: ['100 million views', '억뷰', '1억뷰', '1억 조회수'] },
  { id: 'milestone:views1b', forms: ['1 billion views', '10억뷰', '10억 조회수'] },

  // Awards
  { id: 'award:mama', forms: ['mama', '엠넷 아시안 뮤직 어워즈'] },
  { id: 'award:goldendisc', forms: ['golden disc', '골든디스크'] },
  { id: 'award:seoulmusic', forms: ['seoul music awards', '서울가요대상'] },
  { id: 'award:mma', forms: ['melon music awards', '멜론뮤직어워드'] },
  { id: 'award:bbma', forms: ['billboard music awards', 'bbma', '빌보드 뮤직 어워드'] },
  { id: 'award:rookie', forms: ['rookie of the year', '신인상'] },
  { id: 'award:daesang', forms: ['daesang', '대상'] },

  // Brands, exhibitions and festivals that name the occurrence
  { id: 'brand:chanel', forms: ['chanel', '샤넬'] },
  { id: 'brand:dfesta', forms: ["d'festa", 'd festa', '디페스타'] },
  { id: 'brand:kcon', forms: ['kcon', '케이콘'] },
  { id: 'brand:smtown', forms: ['smtown', '에스엠타운'] },
]

const CONTEXT_BY_ID = EVENT_CONTEXT_IDS

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** NFKC-fold, lowercase, keep letters/digits/Hangul/spaces/'/- — quotes go. */
export function normalizeConceptText(text: string): string {
  return (text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Does `haystack` contain this spelling?
 *
 * Latin spellings match on word boundaries so `mv` never hits `movies` and
 * `mama` never hits `mammary`; Hangul attaches its particles straight onto the
 * word ("아이브가"), so a boundary there would reject every real headline.
 */
function containsForm(haystack: string, form: string): boolean {
  const needle = normalizeConceptText(form)
  if (!needle) return false
  if (/^[a-z0-9][a-z0-9\s'-]*$/.test(needle)) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, 'u')
    return pattern.test(haystack)
  }
  return haystack.includes(needle)
}

/**
 * Phrases the publisher itself wrapped in quotes — almost always the song
 * title, album name or event name, i.e. an open-vocabulary subject that no
 * table can enumerate.
 *
 * Straight apostrophes are only accepted when the opening quote is not glued
 * to a letter, so `aespa's comeback` is never read as a quoted subject while
 * `샤넬과 함께한 '더블유 코리아' 화보` is.
 */
export function quotedPhrases(title: string): string[] {
  const text = (title || '')
  const out = new Set<string>()

  const doubleQuoted = /["“]([^"“”]{2,60})["”]/g
  for (const match of text.matchAll(doubleQuoted)) {
    const phrase = normalizeConceptText(match[1] || '')
    if (phrase) out.add(phrase)
  }

  const singleQuoted = /(?<![\p{L}\p{N}])['‘]([^'‘’]{2,60})['’]/gu
  for (const match of text.matchAll(singleQuoted)) {
    const phrase = normalizeConceptText(match[1] || '')
    if (phrase) out.add(phrase)
  }

  // A phrase that is only punctuation or a lone letter identifies nothing.
  return [...out].filter(phrase => phrase.replace(/[^\p{L}\p{N}]/gu, '').length >= 3)
}

export interface TitleConcepts {
  /** Concepts that place the story in time or space. */
  context: Set<string>
  /** Concepts that name which occurrence it is. */
  subject: Set<string>
}

/**
 * Project one headline onto the bilingual concept space.
 *
 * A quoted phrase is classified through the same table: quoting `"Music Bank"`
 * still yields context, not a subject, because the words inside the quotes are
 * a show name. Anything the table does not recognise stays a subject — that is
 * how a song title earns its place.
 */
export function conceptsIn(title: string): TitleConcepts {
  const haystack = normalizeConceptText(title)
  const context = new Set<string>()
  const subject = new Set<string>()

  for (const concept of EVENT_CONCEPTS) {
    if (!concept.forms.some(form => containsForm(haystack, form))) continue
    if (CONTEXT_BY_ID.has(concept.id)) context.add(concept.id)
    else subject.add(concept.id)
  }

  for (const phrase of quotedPhrases(title)) {
    const known = EVENT_CONCEPTS.find(concept => concept.forms.some(form => normalizeConceptText(form) === phrase))
    if (known) {
      if (CONTEXT_BY_ID.has(known.id)) context.add(known.id)
      else subject.add(known.id)
      continue
    }
    subject.add(`quoted:${phrase}`)
  }

  return { context, subject }
}
