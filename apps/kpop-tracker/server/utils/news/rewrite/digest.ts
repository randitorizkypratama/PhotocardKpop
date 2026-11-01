import { ARTISTS } from '../artists'
import { conceptsIn } from '../eventLexicon'
import { slugify } from './store'
import type { ArtistId } from '../types'
import type { RecapArticle, RecapTopic, RecapWeekWindow } from './types'

/**
 * Weekly recap digest (§ blog — "IVE Pekan Ini").
 *
 * The blog's per-article rewrites mirror one story each; this module builds
 * the other half of the feed: one recap per artist per week, grouping the
 * window's articles into the headings a reader actually wants — where the
 * artist appeared, which song they performed, which award they took — and
 * keeping every article's publisher so each section can be credited.
 *
 * Everything here is pure: no network, no database, no model. The store only
 * supplies `RecapArticle` rows; bucketing, slugging and credit rendering are
 * deterministic and unit-tested, because they decide what a recap *is* before
 * any token is spent on it.
 */

/** How long one recap window is: a rolling seven days. */
export const RECAP_WINDOW_DAYS = 7

/**
 * The window a recap covers: the seven days ending at `now`.
 *
 * `weekKey` is the window's start date, so a run and any retry on the same
 * day derive the same key — and therefore the same deterministic slug — while
 * the next scheduled week naturally starts a new one.
 */
export function recapWeekWindow(now: Date = new Date()): RecapWeekWindow {
  const end = now.getTime()
  const start = end - RECAP_WINDOW_DAYS * 86400000
  return {
    weekKey: new Date(start).toISOString().slice(0, 10),
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
  }
}

/** Display name for prompts — the model writes "IVE", never an internal id. */
export function recapArtistName(artistId: string): string {
  return ARTISTS[artistId as ArtistId]?.displayName || artistId
}

/**
 * Deterministic slug: `rekap-ive-2026-10-26`.
 *
 * Uniqueness of `news_rewrites.slug` is what makes a recap idempotent: the
 * same artist in the same window can never be drafted twice, whatever the
 * run count or the retry history — the row is skipped instead.
 */
export function recapSlug(artistId: string, weekKey: string): string {
  return `rekap-${slugify(artistId)}-${weekKey}`
}

// ── Topic labels (Indonesian — what the model is told to head a section) ─────

const SHOW_LABELS: Record<string, string> = {
  'show:musicbank': 'Penampilan di Music Bank',
  'show:inkigayo': 'Penampilan di Inkigayo',
  'show:mcountdown': 'Penampilan di M Countdown',
  'show:musiccore': 'Penampilan di Music Core',
  'show:showchampion': 'Penampilan di Show Champion',
  'show:theshow': 'Penampilan di The Show',
  'show:weeklyidol': 'Penampilan di Weekly Idol',
}

const AWARD_LABELS: Record<string, string> = {
  'award:mama': 'Penghargaan MAMA',
  'award:goldendisc': 'Penghargaan Golden Disc',
  'award:seoulmusic': 'Penghargaan Seoul Music Awards',
  'award:mma': 'Penghargaan Melon Music Awards',
  'award:bbma': 'Penghargaan Billboard Music Awards',
  'award:rookie': 'Penghargaan Rookie',
  'award:daesang': 'Penghargaan Daesang',
}

const MILESTONE_LABELS: Record<string, string> = {
  'milestone:views100m': 'Milestone 100 Juta Views',
  'milestone:views1b': 'Milestone 1 Miliar Views',
}

/** Category fallback — matches the blog's `news.category.*` vocabulary. */
const CATEGORY_LABELS: Record<string, string> = {
  release: 'Rilis & Comeback',
  schedule: 'Jadwal',
  performance: 'Penampilan',
  award: 'Penghargaan',
  chart: 'Tangga Lagu',
  business: 'Bisnis',
  media: 'Media & Pictorial',
  personnel: 'Personel',
  other: 'Lainnya',
}

/**
 * Which heading one article belongs under.
 *
 * Priority is the shape of the recap itself: the show it happened on names
 * *where* the artist appeared; a named award or milestone names *what* they
 * achieved; only then does the generic category catch what is left. Quoted
 * phrases and brands are deliberately not headings — a song title belongs to
 * its show's section, and a pictorial reads better under "Media & Pictorial"
 * than under a brand name.
 */
export function topicKeyFor(article: RecapArticle): { key: string, label: string } {
  const concepts = conceptsIn(article.title)

  const show = [...concepts.context].find(id => id.startsWith('show:'))
  if (show) return { key: show, label: SHOW_LABELS[show] || 'Penampilan' }

  const award = [...concepts.subject].find(id => id.startsWith('award:'))
  if (award) return { key: award, label: AWARD_LABELS[award] || 'Penghargaan' }

  const milestone = [...concepts.subject].find(id => id.startsWith('milestone:'))
  if (milestone) return { key: milestone, label: MILESTONE_LABELS[milestone] || 'Milestone' }

  const category = (article.category || 'other').trim().toLowerCase()
  return { key: `category:${category}`, label: CATEGORY_LABELS[category] || CATEGORY_LABELS.other! }
}

export interface BucketOptions {
  /** How many headings a recap may have (default 6). */
  maxTopics?: number
  /** How many articles one heading may summarise (default 4). */
  maxPerTopic?: number
}

/**
 * Group a window's articles into the recap's headings.
 *
 * Guarantees the recap's shape, in order:
 *  - one article lands in exactly one topic, and a duplicate URL is dropped
 *    before it can appear twice (feeds repeat across runs);
 *  - shows first, then awards, then milestones, then categories — the reading
 *    order the recap promises ("tampil di X, menang Y, sisanya…");
 *  - both caps are hard: a noisy week cannot grow an unbounded draft.
 */
export function bucketRecapTopics(articles: RecapArticle[], options: BucketOptions = {}): RecapTopic[] {
  const maxTopics = Math.max(1, options.maxTopics ?? 6)
  const maxPerTopic = Math.max(1, options.maxPerTopic ?? 4)

  const topics = new Map<string, RecapTopic>()
  const seenUrls = new Set<string>()

  for (const article of articles) {
    const url = (article.url || '').trim()
    if (url && seenUrls.has(url)) continue
    if (url) seenUrls.add(url)

    const { key, label } = topicKeyFor(article)
    let topic = topics.get(key)
    if (!topic) {
      topic = { key, label, articles: [] }
      topics.set(key, topic)
    }
    if (topic.articles.length < maxPerTopic) topic.articles.push(article)
  }

  const rank = (key: string): number => {
    if (key.startsWith('show:')) return 0
    if (key.startsWith('award:')) return 1
    if (key.startsWith('milestone:')) return 2
    return 3
  }

  return [...topics.values()]
    .sort((a, b) => rank(a.key) - rank(b.key)) // stable: first-seen order inside a rank
    .slice(0, maxTopics)
}

/** Every article a kept topic contributes, in citation order (1-based later). */
export function recapSources(topics: RecapTopic[]): RecapArticle[] {
  const seen = new Set<string>()
  const out: RecapArticle[] = []
  for (const topic of topics) {
    for (const article of topic.articles) {
      const url = (article.url || '').trim()
      if (url && seen.has(url)) continue
      if (url) seen.add(url)
      out.push(article)
    }
  }
  return out
}

/**
 * Turn the model's `[n]` citation markers into real per-topic credits.
 *
 * Two deterministic passes, because the body is untrusted input:
 *  1. a marker outside `1..sources.length` is dropped — it points at nothing;
 *  2. every surviving marker is replaced with the publisher it stands for, so
 *     a credit line can never name a publisher the model misremembered (or
 *     invented) — the name comes from our own rows.
 *
 * A credit line left empty by the drop is removed entirely: a section that
 * cites nothing should not pretend it has a source.
 */
export function renderRecapCredits(body: string, sources: RecapArticle[]): string {
  const count = sources.length

  const publisherFor = (index: number): string => {
    const source = sources[index - 1]
    return source?.publisherName || source?.publisherDomain || `artikel ${index}`
  }

  const lines = (body || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (!/\[\d+\]/.test(line)) return line

      const dropped = line.replace(/\[(\d+)\]/g, (match, num) => {
        const index = Number(num)
        return index >= 1 && index <= count ? match : ''
      })

      const rendered = dropped
        .replace(/\[(\d+)\]/g, (_match, num) => publisherFor(Number(num)))
        // Separators left behind by a dropped marker: "A, , B" / "A, " / ", A".
        .replace(/\s*,\s*,+/g, ', ')
        .replace(/^[ \t]*,\s*/, '')
        .replace(/\s*,\s*(?=[.;]|$)/g, '')
        .replace(/\s+([.;])/g, '$1')
        .replace(/[ \t]{2,}/g, ' ')
        // An inline credit that lost every marker leaves "… . Sumber:" hanging.
        .replace(/\s*sumber:\s*$/i, '')

      if (/^\s*sumber:?\s*$/i.test(rendered)) return ''
      return rendered
    })

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
