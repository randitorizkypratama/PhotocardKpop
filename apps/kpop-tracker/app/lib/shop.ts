export const SHOP_URLS = {
  tokopedia: 'https://www.tokopedia.com/hibikishop',
  shopee: 'https://id.shp.ee/jxkat4oC',
  tiktok: 'https://www.tiktok.com/@hibikis13',
} as const

export interface ShopProduct {
  id: string
  name: string
  description: string
  badge?: string
  accent: string
  dot: string
  href: string
  cta: string
}

export const shopProducts: ShopProduct[] = [
  {
    id: 'ive',
    name: 'IVE Photocards',
    description: 'Album pulls, POBs, and fan-signed cards — ready to ship.',
    badge: 'Popular',
    accent: 'border-ive/25 bg-ive/5 hover:border-ive/40',
    dot: 'bg-ive',
    href: SHOP_URLS.shopee,
    cta: 'Beli di Shopee',
  },
  {
    id: 'aespa',
    name: 'aespa Photocards',
    description: 'Tour merch, lucky draws, and everyday essentials.',
    badge: 'Restock',
    accent: 'border-aespa/25 bg-aespa/5 hover:border-aespa/40',
    dot: 'bg-aespa',
    href: SHOP_URLS.tokopedia,
    cta: 'Beli di Tokopedia',
  },
  {
    id: 'h2h',
    name: 'Hearts2Hearts',
    description: 'Fresh releases and new drops tracked daily.',
    badge: 'New',
    accent: 'border-h2h/25 bg-h2h/5 hover:border-h2h/40',
    dot: 'bg-h2h',
    href: SHOP_URLS.shopee,
    cta: 'Beli di Shopee',
  },
  {
    id: 'bundle',
    name: 'Bundle & Mystery',
    description: 'Curated bundles and blind packs for collectors.',
    accent: 'border-zinc-200 bg-zinc-50/80 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600',
    dot: 'bg-zinc-500',
    href: SHOP_URLS.tiktok,
    cta: 'Cek di TikTok',
  },
  {
    id: 'topup',
    name: 'Pre-order & Top-up',
    description: 'Open PO for albums and limited photocard sets.',
    accent: 'border-zinc-200 bg-zinc-50/80 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600',
    dot: 'bg-emerald-500',
    href: SHOP_URLS.tokopedia,
    cta: 'Chat / Pre-order',
  },
  {
    id: 'all',
    name: 'Full Etalase',
    description: 'Browse every item in the HIBIKISHOP storefront.',
    accent: 'border-zinc-200 bg-zinc-50/80 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600',
    dot: 'bg-sky-500',
    href: SHOP_URLS.shopee,
    cta: 'Buka etalase',
  },
]
