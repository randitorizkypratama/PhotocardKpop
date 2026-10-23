#!/usr/bin/env node
/**
 * Daily Pocamarket Sync script using Playwright headless browser
 * Bypasses Vercel Security Checkpoint / bot challenge and syncs IVE, aespa, Hearts2Hearts
 *
 * Usage:
 *   node scripts/sync-pocamarket.mjs
 *
 * Env required:
 *   TURSO_DATABASE_URL
 *   TURSO_AUTH_TOKEN
 */

import { createClient } from '@libsql/client'
import { chromium } from 'playwright-chromium'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = join(__dirname, '..')

// Only sync these 3 groups
const GROUPS = ['IVE', 'aespa', 'Hearts2Hearts']
const BATCH_SIZE = 10

function loadEnv() {
  const env = {}
  const envPath = join(appDir, '.env')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      if (!line.includes('=') || line.startsWith('#')) continue
      const i = line.indexOf('=')
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
  }
  for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
    console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
    process.exit(1)
  }
  return env
}

const env = loadEnv()
const db = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
})

function inferCardType(name) {
  const n = (name || '').toUpperCase()
  if (n.includes('LUCKY DRAW')) return 'Lucky Draw'
  if (n.includes('MD VER') || n.includes(' MD ') || n.includes('MD SET')) return 'MD'
  if (n.includes('DIGIPACK')) return 'Album'
  if (n.includes('FANMEETING') || n.includes('FAN MEETING') || n.includes('FAN CERT')) return 'Fan Meeting'
  if (n.includes('WITHMUU') || n.includes('APPLEMUSIC') || n.includes('MAKESTAR') ||
      n.includes('INTERASIA') || n.includes('SOUNDWAVE') || n.includes('KTOWN4U') ||
      n.includes('EVERLINE') || n.includes('MINIRECORD') || n.includes('MUSICART')) return 'POB'
  if (n.includes('SEASON')) return "Season's Greetings"
  if (n.includes('CONCERT') || n.includes('WORLD TOUR') || n.includes('LIVE')) return 'Concert'
  if (n.includes('RANDOM TRADING CARD') || n.includes('TRADING CARD SET')) return 'Trading Card'
  if (n.includes('POP-UP') || n.includes('POP UP')) return 'Pop-up'
  if (n.includes('FANCLUB') || n.includes('FAN CLUB') || n.includes('FAN KIT')) return 'Fan Club'
  if (n.includes('T-SHIRT') || n.includes('SHIRT')) return 'MD'
  return 'Album'
}

const RELEASE_PATTERNS = {
  AESPA: [
    [/KISS\s*N\s*TELL/, 'KISS N TELL'],
    [/LEMONADE/, 'Lemonade'],
    [/DIRTY\s*WORK/, 'Dirty Work'],
    [/RICH\s*MAN/, 'Rich Man'],
    [/ARMAGEDDON/, 'Armageddon'],
    [/WHIPLASH/, 'Whiplash'],
    [/HOT MESS/, 'Hot Mess'],
    [/BETTER THINGS/, 'Better Things'],
    [/SUPERNOVA/, 'Supernova'],
    [/MY WORLD/, 'MY WORLD'],
    [/NEXT\s*LEVEL/, 'Next Level'],
    [/LIFE['\u2019\u02bc]S?\s*TOO\s*SHORT/, "Life's Too Short"],
    [/BLACK\s*MAMBA/, 'Black Mamba'],
    [/DRAMA/, 'Drama'],
    [/GIRLS/, 'Girls'],
    [/SAVAGE/, 'Savage'],
  ],
  HEARTS2HEARTS: [
    [/ICONIC\s*HEART/, 'ICONIC HEART'],
    [/THE\s*CHASE/, 'The Chase'],
    [/FOCUS/, 'FOCUS'],
    [/LEMON\s*TANG/, 'Lemon Tang'],
    [/STYLE/, 'STYLE'],
  ],
  IVE: [
    [/IVE\s*SWITCH/, 'IVE SWITCH'],
    [/BE\s*ALRIGHT/, 'Be Alright'],
    [/LUCID\s*DREAM/, 'LUCID DREAM'],
    [/\bALIVE\b/, 'ALIVE'],
    [/EMPATHY/, 'EMPATHY'],
    [/REVIVE\+/, 'REVIVE+'],
    [/SECRET(?:\s|\.|$)/, 'SECRET'],
    [/I['\u2019\u02bc]\s*VE\s*MINE/, "I'VE MINE"],
    [/LOVED(?:\s|\.|$)/, 'LOVED'],
    [/HEAVEN/, 'HEAVEN'],
    [/BADDIE/, 'BADDIE'],
    [/ALL\s*NIGHT/, 'ALL NIGHT'],
    [/I\s*AM(?:\s|\.|$)/, 'I AM'],
    [/I['\u2019\u02bc]\s*VE\s*IVE/, "I'VE IVE"],
    [/AFTER\s*LIKE/, 'AFTER LIKE'],
    [/LOVE\s*DIVE/, 'LOVE DIVE'],
    [/ELEVEN/, 'ELEVEN'],
  ],
}

function extractReleaseName(name, groupName) {
  const n = (name || '').toUpperCase()
  const g = (groupName || '').toUpperCase()
  const patterns =
    g.includes('HEARTS') ? RELEASE_PATTERNS.HEARTS2HEARTS ?? []
    : g.includes('AESPA') ? RELEASE_PATTERNS.AESPA ?? []
    : RELEASE_PATTERNS.IVE ?? []

  for (const [pattern, label] of patterns) {
    if (pattern.test(n)) return label
  }
  return null
}

function mapCards(results, group) {
  return results.map(card => ({
    id: card.id,
    name: card.name_en,
    image: card.image,
    group_name: card.group_name_en || group,
    member_name: card.member_name_en,
    group_image: card.group_image,
    member_image: card.member_image,
    card_type: inferCardType(card.name_en),
    release_name: extractReleaseName(card.name_en, card.group_name_en || group),
    price: parseFloat(card.price) || 0,
    discounted_price: parseFloat(card.discounted_price) || 0,
    wish_count: card.wish_count || 0,
    sales_volume: card.sales_volume || 0,
    stocked_count: card.stocked_count || 0,
  }))
}

async function batchUpsert(cards, now) {
  const stmts = cards.map(card => ({
    sql: `
      INSERT INTO cards (id, name, image, group_name, member_name, group_image, member_image,
                       card_type, release_name, last_price, last_discounted_price, last_wish_count,
                       last_sales_volume, last_stocked_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, image = excluded.image, member_name = excluded.member_name,
        group_image = excluded.group_image, member_image = excluded.member_image,
        card_type = excluded.card_type, release_name = excluded.release_name,
        last_price = excluded.last_price,
        last_discounted_price = excluded.last_discounted_price, last_wish_count = excluded.last_wish_count,
        last_sales_volume = excluded.last_sales_volume, last_stocked_count = excluded.last_stocked_count,
        updated_at = excluded.updated_at
    `,
    args: [
      card.id, card.name, card.image, card.group_name, card.member_name,
      card.group_image, card.member_image, card.card_type, card.release_name,
      card.price, card.discounted_price,
      card.wish_count, card.sales_volume, card.stocked_count, now,
    ],
  }))

  for (let i = 0; i < stmts.length; i += 50) {
    const chunk = stmts.slice(i, i + 50)
    await db.batch(chunk)
  }

  const historyStmts = cards.map(card => ({
    sql: `
      INSERT INTO price_history (card_id, price, discounted_price, wish_count, sales_volume, stocked_count, recorded_at)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM price_history
        WHERE card_id = ?
          AND price IS ?
          AND COALESCE(discounted_price, -1) IS COALESCE(?, -1)
        ORDER BY recorded_at DESC
        LIMIT 1
      )
    `,
    args: [
      card.id,
      card.price,
      card.discounted_price,
      card.wish_count,
      card.sales_volume,
      card.stocked_count,
      now,
      card.id,
      card.price,
      card.discounted_price,
    ],
  }))

  for (let i = 0; i < historyStmts.length; i += 50) {
    const chunk = historyStmts.slice(i, i + 50)
    try {
      await db.batch(chunk)
    } catch (e) {
      console.error('Failed to write price_history chunk:', e.message)
    }
  }
}

async function run() {
  const startedAt = new Date().toISOString()
  console.log(`[${startedAt}] Starting Pocamarket sync for: ${GROUPS.join(', ')}`)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      total_synced INTEGER,
      results TEXT,
      error TEXT
    )
  `)

  const logResult = await db.execute({
    sql: 'INSERT INTO sync_log (started_at, status) VALUES (?, ?)',
    args: [startedAt, 'running'],
  })
  const logId = Number(logResult.lastInsertRowid) || 0

  let browser
  const results = []

  try {
    // Launch Chromium headless
    const launchOptions = {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    }
    // On Windows locally, if standard Chrome path exists, use it as fallback
    if (process.platform === 'win32' && existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')) {
      launchOptions.executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    }

    browser = await chromium.launch(launchOptions)
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    })

    const page = await context.newPage()
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })

    console.log('Navigating to pocamarket.com to clear security checkpoint...')
    await page.goto('https://pocamarket.com/', { waitUntil: 'domcontentloaded', timeout: 45000 })

    // Check challenge
    for (let i = 0; i < 15; i++) {
      const title = await page.title()
      if (!title.includes('Security Checkpoint')) {
        console.log(`Passed checkpoint: "${title}"`)
        break
      }
      await page.mouse.move(100 + i * 20, 150 + i * 10)
      await new Promise(r => setTimeout(r, 1000))
    }

    const now = new Date().toISOString()

    for (const group of GROUPS) {
      console.log(`\nFetching ${group}...`)
      try {
        const firstPage = await page.evaluate(async (g) => {
          const r = await fetch(`https://pocamarket.com/apis/card/gb/v2/search?q=${encodeURIComponent(g)}&page=1`)
          return { ok: r.ok, status: r.status, json: await r.json() }
        }, group)

        if (!firstPage.ok || !firstPage.json?.success) {
          throw new Error(`Failed to fetch first page (status ${firstPage.status})`)
        }

        const totalCards = firstPage.json.data.count
        const totalPages = Math.ceil(totalCards / 20)
        let totalSynced = 0

        const firstMapped = mapCards(firstPage.json.data.results, group)
        await batchUpsert(firstMapped, now)
        totalSynced += firstMapped.length
        console.log(`[${group}] Page 1/${totalPages} synced (${firstMapped.length} cards)`)

        for (let startPage = 2; startPage <= totalPages; startPage += BATCH_SIZE) {
          const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPages)
          const pagesToFetch = []
          for (let p = startPage; p <= endPage; p++) pagesToFetch.push(p)

          const pageResults = await page.evaluate(async ({ g, pages }) => {
            const promises = pages.map(async (p) => {
              try {
                const res = await fetch(`https://pocamarket.com/apis/card/gb/v2/search?q=${encodeURIComponent(g)}&page=${p}`)
                if (!res.ok) return []
                const data = await res.json()
                return data.success ? data.data.results : []
              } catch {
                return []
              }
            })
            return Promise.all(promises)
          }, { g: group, pages: pagesToFetch })

          const allCards = pageResults.flat()
          if (allCards.length > 0) {
            const mapped = mapCards(allCards, group)
            await batchUpsert(mapped, now)
            totalSynced += mapped.length
          }

          console.log(`[${group}] Pages ${startPage}-${endPage}/${totalPages} synced. Total so far: ${totalSynced}`)
          // Polite delay
          await new Promise(r => setTimeout(r, 500))
        }

        results.push({ group, success: true, totalSynced, totalCards, pages: totalPages })
      } catch (err) {
        console.error(`[${group}] Error: ${err.message}`)
        results.push({ group, success: false, error: err.message })
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + (Number(r.totalSynced) || 0), 0)
    const failed = results.filter(r => !r.success)
    const finalStatus = failed.length === 0 ? 'ok' : failed.length === results.length ? 'error' : 'partial'

    await db.execute({
      sql: `UPDATE sync_log SET finished_at = ?, status = ?, total_synced = ?, results = ? WHERE id = ?`,
      args: [new Date().toISOString(), finalStatus, totalSynced, JSON.stringify(results), logId],
    })

    console.log(`\nSync finished with status: ${finalStatus}. Total synced: ${totalSynced}`)
  } catch (error) {
    console.error('Fatal sync error:', error)
    await db.execute({
      sql: `UPDATE sync_log SET finished_at = ?, status = 'error', error = ? WHERE id = ?`,
      args: [new Date().toISOString(), error?.message || String(error), logId],
    })
    process.exit(1)
  } finally {
    if (browser) await browser.close()
  }
}

run()
