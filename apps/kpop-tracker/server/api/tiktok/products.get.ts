interface ShopProduct {
  id: string
  title: string
  image?: string
  price?: number
  currency?: string
  status?: string
  url?: string
}

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const token = config.tiktokShopAccessToken as string
  const baseUrl = (config.tiktokShopBaseUrl as string) || 'https://open-api.tiktokglobalshop.com'
  const shopCipher = config.tiktokShopShopCipher as string

  if (!token) {
    return {
      success: false,
      configured: false,
      message: 'TIKTOK_SHOP_ACCESS_TOKEN not set (TikTok Shop Partner Center)',
      products: [],
    }
  }

  try {
    const params = new URLSearchParams({ page_size: '100', status: 'ACTIVATE' })
    if (shopCipher) params.set('shop_cipher', shopCipher)

    const res = await fetch(`${baseUrl}/product/202309/products?${params.toString()}`, {
      method: 'GET',
      headers: {
        'x-tts-access-token': token,
        'Content-Type': 'application/json',
        ...(shopCipher ? { 'x-shop-cipher': shopCipher } : {}),
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`TikTok Shop API ${res.status}: ${text.slice(0, 300)}`)
    }

    const json = await res.json().catch(() => null)
    if (json?.code && json.code !== 0 && json.code !== 200) {
      throw new Error(json.message || `TikTok Shop error ${json.code}`)
    }

    const raw = json?.data?.products || []
    const products: ShopProduct[] = raw.map((p: any) => {
      const skus = Array.isArray(p.skus) ? p.skus : []
      const priceInfo = skus[0]?.price || skus[0]?.sale_price || null
      const currency = skus[0]?.currency || p.currency || 'IDR'
      const image =
        (Array.isArray(p.images) && (p.images[0]?.url_list?.[0] || p.images[0])) ||
        p.image ||
        undefined

      return {
        id: String(p.product_id ?? p.id ?? ''),
        title: p.title || p.name || 'Product',
        image: typeof image === 'string' ? image : undefined,
        price: priceInfo != null ? Number(priceInfo) : undefined,
        currency: typeof currency === 'string' ? currency : undefined,
        status: p.status || undefined,
        url: p.product_id
          ? `https://shop.tiktok.com/view/product/${p.product_id}`
          : undefined,
      }
    }).filter((p: ShopProduct) => p.id)

    return {
      success: true,
      configured: true,
      count: products.length,
      products,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'TikTok Shop fetch failed'
    throw createError({
      statusCode: 502,
      statusMessage: message,
    })
  }
})
