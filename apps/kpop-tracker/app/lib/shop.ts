export const SHOP_URLS = {
  tokopedia: 'https://www.tokopedia.com/hibikishop',
  shopee: 'https://id.shp.ee/jxkat4oC',
  tiktok: 'https://www.tiktok.com/@hibikis13',
} as const

export interface ShopProduct {
  id: string
  nameKey: string
  descKey: string
  badgeKey?: string
  accent: string
  dot: string
  href: string
  ctaKey: string
}

export const shopProducts: ShopProduct[] = [
  {
    id: 'ive',
    nameKey: 'shop.p.ive.name',
    descKey: 'shop.p.ive.desc',
    badgeKey: 'shop.p.ive.badge',
    accent: 'border-ive/25 bg-ive/5 hover:border-ive/40',
    dot: 'bg-ive',
    href: SHOP_URLS.shopee,
    ctaKey: 'shop.ctaShopee',
  },
  {
    id: 'aespa',
    nameKey: 'shop.p.aespa.name',
    descKey: 'shop.p.aespa.desc',
    badgeKey: 'shop.p.aespa.badge',
    accent: 'border-aespa/25 bg-aespa/5 hover:border-aespa/40',
    dot: 'bg-aespa',
    href: SHOP_URLS.tokopedia,
    ctaKey: 'shop.ctaTokopedia',
  },
  {
    id: 'h2h',
    nameKey: 'shop.p.h2h.name',
    descKey: 'shop.p.h2h.desc',
    badgeKey: 'shop.p.h2h.badge',
    accent: 'border-h2h/25 bg-h2h/5 hover:border-h2h/40',
    dot: 'bg-h2h',
    href: SHOP_URLS.shopee,
    ctaKey: 'shop.ctaShopee',
  },
  {
    id: 'bundle',
    nameKey: 'shop.p.bundle.name',
    descKey: 'shop.p.bundle.desc',
    accent: 'border-zinc-200 bg-zinc-50/80 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600',
    dot: 'bg-zinc-500',
    href: SHOP_URLS.tiktok,
    ctaKey: 'shop.ctaTiktok',
  },
  {
    id: 'topup',
    nameKey: 'shop.p.topup.name',
    descKey: 'shop.p.topup.desc',
    accent: 'border-zinc-200 bg-zinc-50/80 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600',
    dot: 'bg-emerald-500',
    href: SHOP_URLS.tokopedia,
    ctaKey: 'shop.ctaChat',
  },
  {
    id: 'all',
    nameKey: 'shop.p.all.name',
    descKey: 'shop.p.all.desc',
    accent: 'border-zinc-200 bg-zinc-50/80 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600',
    dot: 'bg-sky-500',
    href: SHOP_URLS.shopee,
    ctaKey: 'shop.ctaStore',
  },
]
