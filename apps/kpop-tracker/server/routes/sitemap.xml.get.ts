const SITE = 'https://kpop-tracker-six.vercel.app'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function urlEntry(loc: string, lastmod?: string | null, priority?: string): string {
  const parts = [`  <url>`, `    <loc>${esc(loc)}</loc>`]
  if (lastmod) parts.push(`    <lastmod>${esc(lastmod.slice(0, 10))}</lastmod>`)
  if (priority) parts.push(`    <priority>${priority}</priority>`)
  parts.push(`  </url>`)
  return parts.join('\n')
}

/**
 * ~16k card URLs + releases + static pages. Cached for 1h so the daily sync's
 * updated_at values are picked up without paying the 2 queries per crawler hit.
 */
export default cachedEventHandler(async (event) => {
  const db = getTursoClient()
  const entries: string[] = []

  const staticPages: Array<[string, string]> = [
    ['/', '1.0'],
    ['/browse', '0.9'],
    ['/releases', '0.8'],
    ['/collection', '0.5'],
    ['/shop', '0.5'],
    ['/status', '0.3'],
  ]
  for (const [path, priority] of staticPages) entries.push(urlEntry(`${SITE}${path}`, null, priority))

  for (const group of DISCOGRAPHY_GROUPS) {
    entries.push(urlEntry(`${SITE}/groups/${encodeURIComponent(group)}`, null, '0.7'))
  }

  const releases = await db.execute(`
    SELECT release_name, group_name, MAX(updated_at) AS lastmod
    FROM cards
    WHERE release_name IS NOT NULL AND TRIM(release_name) != ''
    GROUP BY release_name, group_name
  `)
  for (const row of releases.rows) {
    const group = String(row.group_name)
    const slug = releaseSlug(String(row.release_name))
    entries.push(urlEntry(
      `${SITE}/releases/${encodeURIComponent(group)}/${encodeURIComponent(slug)}`,
      row.lastmod ? String(row.lastmod) : null,
      '0.8',
    ))
  }

  const cards = await db.execute('SELECT id, updated_at FROM cards')
  for (const row of cards.rows) {
    entries.push(urlEntry(`${SITE}/card/${Number(row.id)}`, row.updated_at ? String(row.updated_at) : null, '0.6'))
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
  ].join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return xml
}, {
  maxAge: 60 * 60,
  swr: true,
})
