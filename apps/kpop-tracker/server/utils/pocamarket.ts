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
    // Multi-word / specific titles first
    [/SYNK\s*:\s*COMPL[Aa][Ee]XITY/, 'SYNK : COMPLaeXITY'],
    [/SYNK\s*:\s*[Aa][Ee]XIS\s*LINE/, 'SYNK : aeXIS LINE'],
    [/SYNK\s*:\s*PARALLEL\s*LINE/, 'SYNK : PARALLEL LINE'],
    [/KISS\s*N\s*TELL/, 'KISS N TELL'],
    [/LEMONADE/, 'LEMONADE'],
    [/WDA\b|WHOLE\s*DIFFERENT\s*ANIMAL/, 'WDA (Whole Different Animal)'],
    [/DIRTY\s*WORK/, 'Dirty Work'],
    [/RICH\s*MAN/, 'Rich Man'],
    [/GOOD\s*DAY\s*2025/, 'Good Day 2025 (Telepathy + By the Moonlight Window)'],
    [/ARMAGEDDON/, 'Armageddon'],
    [/WHIPLASH/, 'Whiplash'],
    [/HOT\s*MESS/, 'Hot Mess'],
    [/BETTER\s*THINGS/, 'Better Things'],
    [/SUPERNOVA/, 'Supernova'],
    [/MY\s*WORLD/, 'MY WORLD'],
    [/NEXT\s*LEVEL/, 'Next Level'],
    [/LIFE['\u2019\u02bc]S?\s*TOO\s*SHORT/, "Life's Too Short"],
    [/BLACK\s*MAMBA/, 'Black Mamba'],
    [/DRAMA/, 'Drama'],
    [/GIRLS/, 'Girls'],
    [/SAVAGE/, 'Savage'],
  ],
  HEARTS2HEARTS: [
    [/NEXT\s*CHAPTER/, 'Next Chapter'],
    [/CANDY\s*BOX\s*LOVER/, 'Candy Box Lover'],
    [/MOONRIDE/, 'Moonride'],
    [/ICONIC\s*HEART/, 'ICONIC HEART'],
    [/LEMON\s*TANG/, 'Lemon Tang'],
    [/RUDE!?/, 'RUDE!'],
    [/THE\s*CHASE/, 'The Chase'],
    [/FOCUS/, 'FOCUS'],
    [/PRETTY\s*PLEASE/, 'Pretty Please'],
    [/STYLE/, 'STYLE'],
  ],
  IVE: [
    // Multi-word titles first to avoid partial matches
    [/LOOKS\s*CAN\s*KILL/, 'Looks Can Kill'],
    [/IVE\s*SWITCH/, 'IVE SWITCH'],
    [/IVE\s*SECRET/, 'IVE SECRET'],
    [/IVE\s*EMPATHY/, 'IVE EMPATHY'],
    [/REBEL\s*HEART/, 'REBEL HEART'],
    [/LUCID\s*DREAM/, 'LUCID DREAM'],
    [/BE\s*ALRIGHT/, 'Be Alright'],
    [/BANG\s*BANG/, 'BANG BANG'],
    [/DARE\s*ME/, 'DARE ME'],
    [/REVIVE\+/, 'REVIVE+'],
    [/REVIVE(?:\s|\.|$)/, 'REVIVE+'],
    [/SUPERNOVA\s*LOVE/, 'Supernova Love'],
    [/\bALIVE\b/, 'ALIVE'],
    [/SUMMER\s*FESTA/, 'SUMMER FESTA'],
    [/ALL\s*NIGHT/, 'All Night'],
    // "I'VE MINE" is the album; LOVED / BADDIE / I AM are its tracks, so it
    // has to be checked before them.
    [/I['\u2019\u02bc]\s*VE\s*MINE/, "I'VE MINE"],
    [/LOVED(?:\s|\.|$)/, 'LOVED'],
    [/BADDIE/, 'BADDIE'],
    [/I\s*AM(?:\s|\.|$)/, 'I AM'],
    [/I['\u2019\u02bc]\s*VE\s*IVE/, "I've IVE"],
    [/AFTER\s*LIKE/, 'After LIKE'],
    [/LOVE\s*DIVE/, 'LOVE DIVE'],
    // SECRET without "IVE" prefix — legacy fallback, canonicalizer maps it to "IVE SECRET"
    [/SECRET(?:\s|\.|$)/, 'IVE SECRET'],
    // EMPATHY without "IVE" prefix — legacy fallback
    [/EMPATHY/, 'IVE EMPATHY'],
    [/FASHION(?:\s|\.|$)/, 'Fashion'],
    [/\bWAVE\b/, 'WAVE'],
    [/ELEVEN/, 'ELEVEN'],
  ],
}

export function extractReleaseName(name: string, groupName: string): string | null {
  const n = name.toUpperCase()
  const g = groupName.toUpperCase()
  const patterns: [RegExp, string][] =
    g.includes('HEARTS') ? RELEASE_PATTERNS.HEARTS2HEARTS ?? []
    : g.includes('AESPA') ? RELEASE_PATTERNS.AESPA ?? []
    : RELEASE_PATTERNS.IVE ?? []

  for (const [pattern, label] of patterns) {
    if (pattern.test(n)) return label
  }

  return null
}

export type { PocamarketCard, PocamarketResponse }
