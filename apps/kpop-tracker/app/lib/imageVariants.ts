/**
 * Responsive grid images via Vercel Image Optimization — **disabled until the
 * endpoint is verified**.
 *
 * Why disabled: `/_vercel/image` currently answers 404 on this project for
 * both local and remote sources, so shipping a `srcset` now would make every
 * grid image fetch a URL that does not exist. With the flag off the card grid
 * behaves exactly as before (single `src`, no `sizes`).
 *
 * To turn it on (one deploy, ~5 minutes):
 *   1. Add to `vercel.json`:
 *      "images": {
 *        "remotePatterns": [{ "protocol": "https", "hostname": "d1sut5kn3lwnf7.cloudfront.net" }],
 *        "sizes": [320, 640],
 *        "minimumCacheTTL": 31536000
 *      }
 *   2. Set `ENABLED` below to `true`.
 *   3. Verify before/after deploy:
 *      curl -sI "https://kpop-tracker-six.vercel.app/_vercel/image?url=https%3A%2F%2Fd1sut5kn3lwnf7.cloudfront.net%2Fmedia%2Fphotocard_blur%2F2023%2F04%2F11%2Fb4eb14ebc6a94487880a0c301d31d1&w=320&q=75"
 *      → must be 200 with a `content-type: image/…` and `cache-control` header.
 *
 * Two widths only (320/640): the grid renders ~180–280 CSS px per card, so
 * 320w covers 1× devices and 640w covers 2–3×. Fewer variants = fewer
 * billed optimizations (Vercel's free quota is per optimized response; these
 * are edge-cached for `minimumCacheTTL` afterwards).
 */

const ENABLED = false

/** Widths offered to the browser, in pixels. */
export const GRID_WIDTHS = [320, 640] as const

/**
 * Approximate render width per breakpoint for the card grids (2/3/4/5 columns
 * across the responsive steps used by index, browse, release and collection).
 * Deliberately rounds up so the chosen candidate is never undersized.
 */
export const GRID_SIZES =
  '(min-width: 1536px) 220px, (min-width: 1280px) 240px, (min-width: 1024px) 300px, (min-width: 640px) 31vw, 46vw'

export const imageVariantsEnabled = ENABLED

/** Optimized variant URL, or null when the feature is off. */
export function gridSrcset(src?: string | null): string | null {
  if (!ENABLED || !src) return null
  return GRID_WIDTHS
    .map(w => `/_vercel/image?url=${encodeURIComponent(src)}&w=${w}&q=75 ${w}w`)
    .join(', ')
}

/**
 * Safety net: if a variant URL ever 404s (feature flipped off again, config
 * lost, quota problem) drop back to the plain CloudFront `src` instead of
 * leaving a broken image.
 */
export function onImageError(event: Event) {
  if (!ENABLED) return
  const img = event.currentTarget as HTMLImageElement | null
  if (img?.hasAttribute('srcset')) {
    img.removeAttribute('srcset')
    img.removeAttribute('sizes')
  }
}
