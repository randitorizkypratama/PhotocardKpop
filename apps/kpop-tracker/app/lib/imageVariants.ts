/**
 * Grid images through Vercel Image Optimization.
 *
 * Every card image is **250×388** but weighs 63–100 KB, because the originals
 * were encoded at very high quality. So this is *not* a downscaling win — the
 * source is already narrower than any width offered here, and Vercel never
 * upscales. What it buys is a re-encode at q=75: measured 64,889 B → 9,597 B,
 * an 85% cut, at identical 250×388 output.
 *
 * Hence one width, not two. `w=320` and `w=640` return byte-identical images
 * here; registering both would only mint a second cached variant (and a second
 * entry against the optimization quota) for the same bytes. `GRID_SIZES` still
 * advertises the real per-breakpoint width so the browser resolves to the one
 * candidate that exists.
 *
 * `sizes` in `vercel.json` must list exactly the widths in `GRID_WIDTHS`.
 * Vercel rejects an unlisted width with **400** — confirmed live against
 * `w=400`, which returns `text/plain` 400 while `w=320` returns 200.
 *
 * The real fix for the oversized originals is re-encoding them at the source.
 * That would also cover the album artwork on /releases, which this does not
 * touch (different origin, no srcset there).
 */

/** Keep true only while `images.sizes` in `vercel.json` matches `GRID_WIDTHS`. */
const ENABLED = true

/** Widths offered to the browser, in pixels. */
export const GRID_WIDTHS = [320] as const

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
