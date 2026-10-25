import type { ArtistId } from './types'

/**
 * Artist normalization + contextual matching.
 *
 * An alias hit is a *candidate* signal, never evidence: §3 requires aliases to
 * be disambiguated by context, which matters most for "IVE" — an ordinary
 * English word that shows up in headlines about anything. Matching therefore
 * needs the alias **and** K-pop context terms (or a K-pop-native publisher)
 * before a story is even considered about the artist.
 */

export interface ArtistProfile {
  id: ArtistId
  displayName: string
  /** Aliases used for discovery queries and for matching. */
  aliases: string[]
  /** Latin aliases that collide with ordinary English words. */
  ambiguousAliases: string[]
  /**
   * The Google News `q` for this artist, exactly as configured in the source
   * list (`?q=aespa`, `?q=%22Hearts2Hearts%22`, `?q=%22IVE%22+K-pop`).
   * Quotes keep an ambiguous alias literal; the `K-pop` qualifier keeps IVE
   * from matching every English sentence that contains "ive".
   */
  googleNewsQuery: string
  agency: string
  agencyDomain: string
  /** Members (Latin + Hangul) — identity context, never standalone proof. */
  members: string[]
}

export const ARTISTS: Record<ArtistId, ArtistProfile> = {
  aespa: {
    id: 'aespa',
    displayName: 'aespa',
    aliases: ['aespa', '에스파', 'æspa'],
    ambiguousAliases: [],
    googleNewsQuery: 'aespa',
    agency: 'SM Entertainment',
    agencyDomain: 'smentertainment.com',
    members: ['karina', '카리나', 'winter', '윈터', 'giselle', '지젤', 'ningning', '닝닝'],
  },
  hearts2hearts: {
    id: 'hearts2hearts',
    displayName: 'Hearts2Hearts',
    aliases: ['Hearts2Hearts', 'Hearts 2 Hearts', '하츠투하츠', '하츠 투 하츠', 'H2H'],
    ambiguousAliases: ['h2h'],
    googleNewsQuery: '"Hearts2Hearts"',
    agency: 'SM Entertainment',
    agencyDomain: 'smentertainment.com',
    members: [
      'carmen', '카르멘', 'jiwoo', '지우', 'yuha', '유하', 'stella', '스텔라',
      'juun', '주은', 'a-na', '아나', 'ian', '이안', 'ye-on', '예온', 'yeon',
    ],
  },
  ive: {
    id: 'ive',
    displayName: 'IVE',
    aliases: ['IVE', '아이브'],
    ambiguousAliases: ['IVE'],
    googleNewsQuery: '"IVE" K-pop',
    agency: 'Starship Entertainment',
    agencyDomain: 'starship-ent.com',
    members: [
      'wonyoung', 'won-young', '장원영', 'yujin', '안유진', 'gaeul', '가을',
      'rei', '레이', 'liz', '리즈', 'leeseo', '이서',
    ],
  },
}

/** The configured Google News query for one artist (falls back to building it). */
export function googleNewsQueryFor(profile: ArtistProfile): string {
  return profile.googleNewsQuery || artistSearchQuery(profile)
}

/**
 * Context that makes an alias mention *about* the artist rather than a
 * coincidental string. Deliberately broad: this only decides whether a story
 * is a candidate — the verification gates decide whether it is publishable.
 */
const KPOP_CONTEXT_TERMS = [
  'kpop', 'k-pop', 'comeback', 'album', 'ep', 'single', 'track', 'title track',
  'idol', 'girl group', 'boy group', 'member', 'members', 'fandom', 'debut',
  'teaser', 'trailer', 'concept', 'photocard', 'music video', 'mv', 'release',
  'released', 'drops', 'drop', 'announce', 'announces', 'announced', 'preview',
  'concert', 'tour', 'fan meeting', 'fansign', 'showcase', 'stage', 'performance',
  'music show', 'music bank', 'inkigayo', 'mcountdown', 'show champion',
  'chart', 'hanteo', 'gaon', 'circle chart', 'billboard', 'award', 'rookie',
  'agency', 'entertainment', 'seoul', 'schedule', 'lineup', 'subunit',
  'lightstick', 'season', 'greetings', 'merch', 'broadcast', 'variety', 'ost',
  // Hangul context: Naver/Yonhap/Korean-language headlines carry none of the
  // Latin terms above, so a Korean article still needs identity to count.
  '컴백', '앨범', '음원', '음반', '발매', '신곡', '타이틀곡', '무대', '콘서트',
  '공연', '팬미팅', '팬싸인', '아이돌', '걸그룹', '보이그룹', '멤버', '소속사',
  '뮤직비디오', '차트', '쇼케이스', '활동', '데뷔', '선공개', '수록곡',
  // Additional Korean entertainment terms
  '스케줄', '활동재개', '티저', '예고', '확정', '발표', '공개', '진행',
  '음악방송', '음방', '방송', '인기가요', '뮤직뱅크', '엠카운트다운',
  '하이브', '에스엠', '카카오', '와이지', '제이와이피', '스타쉽',
]

export interface ArtistMatch {
  artistId: ArtistId
  matchedAlias: string
  contextTerms: string[]
  /** `true` when context — not the alias alone — established relevance. */
  contextual: boolean
  score: number
}

export interface ArtistMatchResult {
  match: ArtistMatch | null
  /** Set when two artists scored equally, so the caller can log why. */
  ambiguous: boolean
  /** Aliases seen with no usable context (e.g. bare "IVE" in an English headline). */
  rejected: Array<{ alias: string, artistId: ArtistId, reason: string }>
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A Latin-script word alias (ASCII letters/digits). Boundary matching only
 * makes sense where words are space-delimited: Korean attaches particles
 * straight onto the word — "아이브가", "아이브는" — so a boundary would reject
 * every real Korean headline that mentions the artist.
 */
function isLatinWordAlias(alias: string): boolean {
  return /^[A-Za-z0-9]+$/.test(alias)
}

/** NFKC-fold full-width forms, lowercase, keep letters/digits/Hangul/spaces. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findAliasOccurrences(haystack: string, alias: string): number {
  const needle = alias.toLowerCase()
  if (isLatinWordAlias(needle)) {
    // Word boundaries: "live"/"delivered" must not match IVE, and an
    // apostrophe *before* the alias means a contraction ("I've") rather than
    // a standalone mention. One after it is fine — "aespa's comeback".
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}'’])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, 'gu')
    return (haystack.match(pattern) || []).length
  }
  return haystack.split(needle).length - 1
}

function contextTermsIn(haystack: string, profile: ArtistProfile): string[] {
  const found = new Set<string>()
  for (const term of KPOP_CONTEXT_TERMS) {
    if (findAliasOccurrences(haystack, term) > 0) found.add(term)
  }
  for (const term of profile.members) {
    if (findAliasOccurrences(haystack, term) > 0) found.add(term)
  }
  const agencyWord = profile.agency.split(' ')[0] ?? ''
  if (agencyWord && findAliasOccurrences(haystack, agencyWord) > 0) found.add(profile.agency)
  return [...found]
}

/**
 * Pick the single artist a text is about, or nothing.
 *
 * `publisherIsKpopSource` lets a caller pass known K-pop publisher identity as
 * context (a Soompi headline about "IVE" is disambiguated by the publisher,
 * not by the bare alias). The alias alone is never enough for the ambiguous
 * aliases.
 */
export function matchArtist(
  text: string,
  options: { publisherIsKpopSource?: boolean, extraContext?: string[] } = {},
): ArtistMatchResult {
  const haystack = normalizeForMatch(text)
  const rejected: ArtistMatchResult['rejected'] = []
  const candidates: ArtistMatch[] = []

  for (const profile of Object.values(ARTISTS)) {
    let bestAlias: string | null = null
    let hits = 0
    for (const alias of profile.aliases) {
      const found = findAliasOccurrences(haystack, alias)
      if (found > hits) {
        hits = found
        bestAlias = alias
      }
    }
    if (!bestAlias) continue

    const context = new Set(contextTermsIn(haystack, profile))
    for (const term of options.extraContext || []) {
      const normalized = normalizeForMatch(term)
      if (normalized && findAliasOccurrences(haystack, normalized) > 0) context.add(term)
    }
    const hasContext = context.size > 0 || options.publisherIsKpopSource === true

    if (profile.ambiguousAliases.some(alias => alias.toLowerCase() === bestAlias!.toLowerCase()) && !hasContext) {
      rejected.push({
        alias: bestAlias,
        artistId: profile.id,
        reason: 'ambiguous alias without K-pop context',
      })
      continue
    }

    candidates.push({
      artistId: profile.id,
      matchedAlias: bestAlias,
      contextTerms: [...context],
      contextual: hasContext,
      score: hits * 10 + context.size,
    })
  }

  if (candidates.length === 0) return { match: null, ambiguous: false, rejected }

  candidates.sort((a, b) => b.score - a.score)
  const top = candidates[0]!
  const runnerUp = candidates[1]
  if (runnerUp && runnerUp.score === top.score) {
    return { match: null, ambiguous: true, rejected }
  }
  return { match: top, ambiguous: false, rejected }
}

/** Google News query for one artist, built from its aliases. */
export function artistSearchQuery(profile: ArtistProfile): string {
  const terms = profile.aliases.map((alias) => {
    const needsQuotes = /[\s]/.test(alias) || !isLatinWordAlias(alias)
    return needsQuotes ? `"${alias}"` : alias
  })
  return `(${terms.join(' OR ')})`
}
