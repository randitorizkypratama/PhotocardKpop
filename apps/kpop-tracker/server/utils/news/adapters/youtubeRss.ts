import { validateExternalUrl } from '../url'

/**
 * YouTube channel feed adapter — the keyless replacement for the Data API.
 *
 * `https://www.youtube.com/feeds/videos.xml?channel_id=…` is a public Atom feed
 * that needs no key and no quota. It lists the channel's most recent uploads
 * — music videos, teasers, behind-the-scenes clips and Shorts alike (a Short is
 * just a vertical video in the same feed) — with the video id, title,
 * description, publication time and thumbnail.
 *
 * The trade-off is depth: the feed only ever carries the latest ~15 entries and
 * no view counts or durations. A weekly run does not need more than that.
 *
 * Only a channel on the operator's allowlist is ever fetched, so every entry is
 * official by construction: a display name matching "aespa official" proves
 * nothing and is never used to grant official status.
 */

export interface YouTubeFeedUpload {
  videoId: string
  title: string
  description: string
  publishedAt: string | null
  url: string
  thumbnail: string | null
  /** Channel name declared by the feed (e.g. "aespa"). */
  channelTitle: string | null
}

const CHANNEL_ID_RE = /^UC[\w-]{20,}$/
const VIDEO_ID_RE = /^[\w-]{6,}$/

/** The public Atom feed for a channel, or `null` when the id is malformed. */
export function youtubeFeedUrl(channelId: string): string | null {
  const clean = (channelId || '').trim()
  if (!CHANNEL_ID_RE.test(clean)) return null
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(clean)}`
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  const value = match?.[1]
  return value ? decodeEntities(value.trim()) : null
}

/** The first `<media:thumbnail url="…">` in the entry, if it is a usable URL. */
function thumbnailUrl(block: string): string | null {
  const raw = /<media:thumbnail[^>]*\burl\s*=\s*["']([^"']+)["']/i.exec(block)?.[1]
  if (!raw) return null
  const decoded = decodeEntities(raw)
  return validateExternalUrl(decoded).ok ? decoded : null
}

/**
 * Parse an Atom channel feed into uploads. A Short is included like any other
 * upload — the feed does not mark it, so `title`/`description` carry the only
 * hint (e.g. `#Shorts`).
 */
export function parseYouTubeFeed(xml: string): YouTubeFeedUpload[] {
  const feedTitle = tag(xml.replace(/<entry[\s>][\s\S]*?<\/entry>/gi, ''), 'title')
  const uploads: YouTubeFeedUpload[] = []
  const blocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []

  for (const block of blocks) {
    const videoId = tag(block, 'yt:videoId') || /yt:video:([\w-]+)/i.exec(block)?.[1] || ''
    if (!VIDEO_ID_RE.test(videoId)) continue

    const title = tag(block, 'media:title') || tag(block, 'title') || ''
    if (!title) continue

    const url = `https://www.youtube.com/watch?v=${videoId}`
    if (!validateExternalUrl(url).ok) continue

    uploads.push({
      videoId,
      title,
      // The description is often just credits; keep it verbatim so the rewrite
      // can decide how much of it is worth using.
      description: tag(block, 'media:description') || '',
      publishedAt: tag(block, 'published') || tag(block, 'updated'),
      url,
      // Fall back to YouTube's stable per-video thumbnail so a feed entry that
      // omits <media:thumbnail> still has a picture.
      thumbnail: thumbnailUrl(block) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      channelTitle: tag(block, 'author') ? tag(tag(block, 'author') || '', 'name') : feedTitle,
    })
  }

  return uploads
}
