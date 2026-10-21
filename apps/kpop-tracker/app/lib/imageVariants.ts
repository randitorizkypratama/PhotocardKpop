/**
 * Responsive images for the two CDNs this app pulls from. They take two
 * different routes, and the distinction matters — only one is ours to control.
 *
 * ## Card grids — Vercel Image Optimization
 *
 * Every card image is **250×388** but weighs 63–100 KB, because the originals
 * were encoded at very high quality. So this is *not* a downscaling win: the
 * source is already narrower than any width offered here, and Vercel never
 * upscales. What it buys is a re-encode at q=75 — measured 64,889 B → 9,597 B,
 * an 85% cut at identical 250×388 output.
 *
 * Hence one width, not two. `w=320` and `w=640` return byte-identical images
 * here; registering both would only mint a second cached variant, and a second
 * entry against the optimization quota, for the same bytes. `GRID_SIZES` still
 * advertises the real per-breakpoint width so the browser resolves to the one
 * candidate that exists.
 *
 * `sizes` in `vercel.json` must list exactly the widths in `GRID_WIDTHS`.
 * Vercel rejects an unlisted width with **400** — confirmed live against
 * `w=400`, which returns `text/plain` 400 while `w=320` returns 200.
 *
 * The originals cannot be fixed at the source: they live on Pocamarket's
 * CloudFront and this repo only consumes their URLs — there is no upload path
 * here to re-encode through.
 *
 * ## Album artwork — Apple's CDN, no optimizer involved
 *
 * Stored artwork URLs are pinned to `600x600` by `server/utils/releases/apple.ts`,
 * while the layout shows them at 48–220 CSS px. Apple's CDN resizes natively
 * from the trailing `/WxHbb.jpg` of the URL, so rewriting that suffix is
 * enough — measured 227,653 B at 600×600 → 12,242 B at 128×128. No allowlist,
 * no quota, no edge round trip, and it keeps working even if Vercel Image
 * Optimization is ever turned off.
 */

/**
 * Keep true only while `images.sizes` in `vercel.json` matches `GRID_WIDTHS`.
 *
 * Off in dev on purpose: `/_vercel/image` is a Vercel platform runtime route and
 * `nuxt dev` does not serve it, so every card grid would 404 locally and leave
 * the app looking broken to whoever is working on it. Falling back to the plain
 * `src` costs nothing here — dev has no optimization quota to spend. Album
 * artwork is unaffected either way, since `artworkSrcset` rewrites Apple's own
 * size suffix and never touches the optimizer.
 */
const ENABLED = !import.meta.dev

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

/** Optimized variant URL, or undefined when the feature is off. */
export function gridSrcset(src?: string | null): string | undefined {
  if (!ENABLED || !src) return undefined
  return GRID_WIDTHS
    .map(w => `/_vercel/image?url=${encodeURIComponent(src)}&w=${w}&q=75 ${w}w`)
    .join(', ')
}

/** The size suffix Apple's artwork CDN reads, e.g. `/600x600bb.jpg`. */
const ARTWORK_SUFFIX = /\/\d+x\d+bb\.jpg$/

/** Artwork in the release grids — 150–220 CSS px boxes. */
export const ART_CARD_WIDTHS = [320, 600] as const

/** Artwork in timeline rows and cards — 48–96 CSS px thumbnails. */
export const ART_THUMB_WIDTHS = [128, 256] as const

/**
 * Artwork srcset built by rewriting the CDN's own size suffix.
 *
 * Returns null unless the URL carries that suffix, so a CloudFront card image
 * (the `release.image` fallback behind `release.artwork || release.image`) or
 * any oddly shaped URL keeps its plain `src` untouched.
 *
 * `sizes` is left to each call site, since these boxes differ per template.
 * Binding it statically is deliberate: a `sizes` attribute on an `<img>` with
 * no `srcset` is ignored by the spec, so it costs nothing to always emit it and
 * saves re-running the regex per item inside a `v-for`.
 *
 * Returns `undefined` rather than `null` so the result binds straight to a
 * Vue `srcset` prop, which is typed `string | undefined`.
 */
export function artworkSrcset(src: string | null | undefined, widths: readonly number[]): string | undefined {
  if (!src || !ARTWORK_SUFFIX.test(src)) return undefined
  return widths.map(w => `${src.replace(ARTWORK_SUFFIX, `/${w}x${w}bb.jpg`)} ${w}w`).join(', ')
}

/**
 * Safety net for both routes: if a srcset URL ever fails (endpoint turned off,
 * config lost, quota problem, an artwork shape we did not anticipate) drop the
 * srcset and let the element fall back to its plain `src`, rather than leaving
 * a broken image.
 *
 * Deliberately not gated on `ENABLED` — artwork srcsets are built by
 * `artworkSrcset` and work whether or not Vercel Image Optimization is on. For
 * an `<img>` without a `srcset` attribute this is a no-op.
 */
export function onImageError(event: Event) {
  const img = event.currentTarget as HTMLImageElement | null
  if (img?.hasAttribute('srcset')) {
    img.removeAttribute('srcset')
    img.removeAttribute('sizes')
  }
}
