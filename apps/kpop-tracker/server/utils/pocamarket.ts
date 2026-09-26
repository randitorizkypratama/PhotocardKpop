interface PocamarketCard {
  id: number
  name_en: string
  image: string
  group_name_en: string
  member_name_en: string
  group_image: string
  member_image: string
  price: string
  discounted_price: string
  discount_rate: number
  is_in_promotion: boolean
  recently_price: string
  wish_count: number
  sales_volume: number
  stocked_count: number
  sell_offer_date: string
  best_pick: boolean
}

interface PocamarketResponse {
  success: boolean
  code: string
  data: {
    count: number
    next_page: number | null
    results: PocamarketCard[]
  }
}

const API_BASE = 'https://pocamarket.com/apis/card/gb/v2'

export async function fetchPocamarketCards(query: string, page: number = 1): Promise<PocamarketResponse> {
  const url = `${API_BASE}/search?q=${encodeURIComponent(query)}&page=${page}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Pocamarket API error: ${response.status}`)
  }
  return response.json()
}

export async function fetchAllGroupCards(groupName: string, maxPages: number = 5): Promise<PocamarketCard[]> {
  const allCards: PocamarketCard[] = []
  
  for (let page = 1; page <= maxPages; page++) {
    const response = await fetchPocamarketCards(groupName, page)
    if (!response.success || response.data.results.length === 0) break
    allCards.push(...response.data.results)
    if (!response.data.next_page) break
  }
  
  return allCards
}

export function inferCardType(name: string): string {
  const n = name.toUpperCase()
  if (n.includes('LUCKY DRAW')) return 'Lucky Draw'
  if (n.includes('MD VER') || n.includes(' MD ') || n.includes('MD SET')) return 'MD'
  if (n.includes('DIGIPACK')) return 'Album'
  if (n.includes('FANMEETING') || n.includes('FAN MEETING') || n.includes('FAN CERT')) return 'Fan Meeting'
  if (n.includes('WITHMUU') || n.includes('APPLEMUSIC') || n.includes('MAKESTAR') || 
      n.includes('INTERASIA') || n.includes('SOUNDWAVE') || n.includes('KTOWN4U') ||
      n.includes('EVERLINE') || n.includes('MINIRECORD') || n.includes('MUSICART')) return 'POB'
  if (n.includes('SEASON')) return "Season's Greetings"
  if (n.includes('CONCERT') || n.includes('WORLD TOUR') || n.includes('LIVE')) return 'Concert'
  if (n.includes('RANDOM TRADING CARD') || n.includes('TRADING CARD SET')) return 'Trading Card'
  if (n.includes('POP-UP') || n.includes('POP UP')) return 'Pop-up'
  if (n.includes('FANCLUB') || n.includes('FAN CLUB') || n.includes('FAN KIT')) return 'Fan Club'
  if (n.includes('T-SHIRT') || n.includes('SHIRT')) return 'MD'
  return 'Album'
}

// Album tokens are scoped per group so a generic word in one group's card name
// (aespa "Girls", Hearts2Hearts "Focus") can never be misread as another
// group's release.
const RELEASE_PATTERNS: Record<string, [RegExp, string][]> = {
  AESPA: [
    [/KISS\s*N\s*TELL/, 'KISS N TELL'],
    [/LEMONADE/, 'Lemonade'],
    [/DIRTY\s*WORK/, 'Dirty Work'],
    [/RICH\s*MAN/, 'Rich Man'],
    [/ARMAGEDDON/, 'Armageddon'],
    [/WHIPLASH/, 'Whiplash'],
    [/HOT MESS/, 'Hot Mess'],
    [/BETTER THINGS/, 'Better Things'],
    [/SUPERNOVA/, 'Supernova'],
    [/MY WORLD/, 'MY WORLD'],
    [/NEXT\s*LEVEL/, 'Next Level'],
    [/LIFE['\u2019\u02bc]S?\s*TOO\s*SHORT/, "Life's Too Short"],
    [/BLACK\s*MAMBA/, 'Black Mamba'],
    [/DRAMA/, 'Drama'],
    [/GIRLS/, 'Girls'],
    [/SAVAGE/, 'Savage'],
  ],
  HEARTS2HEARTS: [
    [/ICONIC\s*HEART/, 'ICONIC HEART'],
    [/THE\s*CHASE/, 'The Chase'],
    [/FOCUS/, 'FOCUS'],
    [/LEMON\s*TANG/, 'Lemon Tang'],
    [/STYLE/, 'STYLE'],
  ],
  IVE: [
    [/IVE\s*SWITCH/, 'IVE SWITCH'],
    [/BE\s*ALRIGHT/, 'Be Alright'],
    [/LUCID\s*DREAM/, 'LUCID DREAM'],
    [/\bALIVE\b/, 'ALIVE'],
    [/EMPATHY/, 'EMPATHY'],
    [/REVIVE\+/, 'REVIVE+'],
    [/SECRET(?:\s|\.|$)/, 'SECRET'],
    // "I'VE MINE" is the album; LOVED / BADDIE / I AM are its tracks, so it
    // has to be checked before them.
    [/I['\u2019\u02bc]\s*VE\s*MINE/, "I'VE MINE"],
    [/LOVED(?:\s|\.|$)/, 'LOVED'],
    [/HEAVEN/, 'HEAVEN'],
    [/BADDIE/, 'BADDIE'],
    [/ALL\s*NIGHT/, 'ALL NIGHT'],
    [/I\s*AM(?:\s|\.|$)/, 'I AM'],
    [/I['\u2019\u02bc]\s*VE\s*IVE/, "I'VE IVE"],
    [/AFTER\s*LIKE/, 'AFTER LIKE'],
    [/LOVE\s*DIVE/, 'LOVE DIVE'],
    [/ELEVEN/, 'ELEVEN'],
  ],
}

export function extractReleaseName(name: string, groupName: string): string | null {
  const n = name.toUpperCase()
  const g = groupName.toUpperCase()
  const patterns =
    g.includes('HEARTS') ? RELEASE_PATTERNS.HEARTS2HEARTS
    : g.includes('AESPA') ? RELEASE_PATTERNS.AESPA
    : RELEASE_PATTERNS.IVE

  for (const [pattern, label] of patterns) {
    if (pattern.test(n)) return label
  }

  return null
}

export type { PocamarketCard, PocamarketResponse }
