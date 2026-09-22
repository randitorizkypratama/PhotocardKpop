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
  if (n.includes('MD VER') || n.includes('MD ')) return 'MD'
  if (n.includes('DIGIPACK')) return 'Album'
  if (n.includes('FANMEETING') || n.includes('FAN MEETING')) return 'Fan Meeting'
  if (n.includes('WITHMUU') || n.includes('APPLEMUSIC') || n.includes('MAKESTAR') || n.includes('INTERASIA')) return 'POB'
  if (n.includes('SEASON')) return "Season's Greetings"
  if (n.includes('CONCERT') || n.includes('WORLD TOUR')) return 'Concert'
  if (n.includes('RANDOM TRADING CARD')) return 'Trading Card'
  if (n.includes('POP-UP')) return 'Pop-up'
  return 'Album'
}

export type { PocamarketCard, PocamarketResponse }
