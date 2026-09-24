export const GROUPS = ['IVE', 'aespa', 'Hearts2Hearts'] as const

export type GroupName = (typeof GROUPS)[number]

export const MEMBERS: Record<string, string[]> = {
  IVE: ['WONYOUNG', 'LIZ', 'GAEUL', 'REI', 'YUJIN', 'LEESEO'],
  aespa: ['KARINA', 'WINTER', 'GISELLE', 'NINGNING'],
  Hearts2Hearts: ['IAN', 'JIWOO', 'YE-ON', 'Carmen', 'Stella', 'YUHA'],
}

export const CARD_TYPES = [
  'Album',
  'POB',
  'Lucky Draw',
  'MD',
  'Fan Meeting',
  "Season's Greetings",
  'Concert',
  'Trading Card',
  'Pop-up',
  'Fan Club',
]

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Popular' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'stock', label: 'Most Stock' },
  { value: 'name', label: 'Name A-Z' },
]

const GROUP_ACCENTS: Record<string, string> = {
  IVE: 'text-ive',
  aespa: 'text-aespa',
  Hearts2Hearts: 'text-h2h',
}

const GROUP_ACCENT_BG: Record<string, string> = {
  IVE: 'bg-ive/10 text-ive border-ive/20',
  aespa: 'bg-aespa/10 text-aespa border-aespa/20',
  Hearts2Hearts: 'bg-h2h/10 text-h2h border-h2h/20',
}

const GROUP_ACCENT_ACTIVE: Record<string, string> = {
  IVE: 'border-ive/40 bg-ive/10 text-ive',
  aespa: 'border-aespa/40 bg-aespa/10 text-aespa',
  Hearts2Hearts: 'border-h2h/40 bg-h2h/10 text-h2h',
}

export function groupAccent(group: string): string {
  return GROUP_ACCENTS[group] ?? 'text-muted-foreground'
}

export function groupAccentBg(group: string): string {
  return GROUP_ACCENT_BG[group] ?? 'bg-muted text-muted-foreground border-border'
}

export function groupAccentActive(group: string): string {
  return GROUP_ACCENT_ACTIVE[group] ?? 'border-border bg-muted text-foreground'
}

export function groupDot(group: string): string {
  const map: Record<string, string> = {
    IVE: 'bg-ive',
    aespa: 'bg-aespa',
    Hearts2Hearts: 'bg-h2h',
  }
  return map[group] ?? 'bg-muted-foreground'
}

export function formatIDR(usd: number, rate?: number): string {
  const fx = rate || 17800
  return Math.round((Number(usd) || 0) * fx).toLocaleString('id-ID')
}

export function formatUSD(usd: number): string {
  return `$${(Number(usd) || 0).toFixed(2)}`
}
