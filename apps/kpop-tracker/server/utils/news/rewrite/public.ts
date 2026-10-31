import { isRenderableMediaUrl, validateExternalUrl } from '../url'
import type { PublishedRewrite } from './store'
import type { NewsRewrite, RewriteImage, RewriteSource } from './types'

/**
 * Shapers for the public blog API.
 *
 * Two things they guarantee on the way out: a draft can never be serialised
 * (the caller only passes a published row, and `toPublicCard` refuses anything
 * else), and every URL/asset that reaches a browser has already passed the
 * SSRF allowlist or the renderable-media check.
 */

export interface PublicCard {
  id: string
  slug: string
  title: string
  dek: string
  artist_id: string
  category: string
  reading_minutes: number
  published_at: string | null
  thumbnail: string | null
}

export interface PublicArticleImage {
  image_url: string
  source_url: string
  credit_text: string | null
  credit_url: string | null
  caption: string | null
}

export interface PublicArticleSource {
  source_url: string
  publisher_name: string | null
  publisher_domain: string | null
  original_title: string | null
  published_at: string | null
}

export interface PublicArticle extends PublicCard {
  body_markdown: string
  images: PublicArticleImage[]
  sources: PublicArticleSource[]
  transparency: {
    verification_status: string | null
    verification_score: number | null
    publisher_name: string | null
    publisher_domain: string | null
  }
}

function safeLink(value: string | null): string | null {
  if (!value) return null
  return validateExternalUrl(value).ok ? value : null
}

function safeMedia(value: string | null): string | null {
  if (!value) return null
  return isRenderableMediaUrl(value) ? value : null
}

export function toPublicCard(rewrite: PublishedRewrite): PublicCard | null {
  if (rewrite.status !== 'published') return null
  return {
    id: rewrite.id,
    slug: rewrite.slug,
    title: rewrite.title,
    dek: rewrite.dek,
    artist_id: rewrite.artistId,
    category: rewrite.category,
    reading_minutes: rewrite.readingMinutes,
    published_at: rewrite.publishedAt,
    thumbnail: safeMedia(rewrite.thumbnail),
  }
}

export function toPublicArticle(
  rewrite: NewsRewrite,
  images: RewriteImage[],
  sources: RewriteSource[],
  transparency: PublicArticle['transparency'],
): PublicArticle | null {
  if (rewrite.status !== 'published') return null
  const firstImage = images.map(image => safeMedia(image.imageUrl)).find(Boolean) ?? null

  return {
    id: rewrite.id,
    slug: rewrite.slug,
    title: rewrite.title,
    dek: rewrite.dek,
    artist_id: rewrite.artistId,
    category: rewrite.category,
    reading_minutes: rewrite.readingMinutes,
    published_at: rewrite.publishedAt,
    thumbnail: firstImage,
    body_markdown: rewrite.bodyMarkdown,
    images: images
      .map(image => ({
        image_url: safeMedia(image.imageUrl) || '',
        source_url: safeLink(image.sourceUrl) || '',
        credit_text: image.creditText,
        credit_url: safeLink(image.creditUrl),
        caption: image.caption,
      }))
      .filter(image => image.image_url && image.source_url),
    sources: sources
      .map(source => ({
        source_url: safeLink(source.sourceUrl) || '',
        publisher_name: source.publisherName,
        publisher_domain: source.publisherDomain,
        original_title: source.originalTitle,
        published_at: source.publishedAt,
      }))
      .filter(source => Boolean(source.source_url)),
    transparency,
  }
}
