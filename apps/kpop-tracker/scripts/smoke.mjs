#!/usr/bin/env node
/**
 * Post-deploy smoke test for the production deployment.
 *
 * Verifies the endpoints and pages that broke during past deploys:
 * timeline data, discography-backed group API, the sync badge endpoint,
 * auth-protected endpoints rejecting anonymous calls, and the main pages.
 *
 * Usage: node scripts/smoke.mjs [base-url]
 *   SMOKE_BASE_URL is read when no argument is given.
 */

const base = String(
  process.argv[2] || process.env.SMOKE_BASE_URL || 'https://kpop-tracker-six.vercel.app',
).replace(/\/+$/, '')

const TIMEOUT_MS = 60_000
let failed = 0

async function check(name, run) {
  try {
    const note = await run()
    console.log(`ok   ${name}${note ? ` — ${note}` : ''}`)
  } catch (error) {
    failed++
    console.error(`FAIL ${name} — ${error?.message || error}`)
  }
}

async function fetchJson(path, init) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'kpop-tracker-smoke', ...(init?.headers || {}) },
  })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    // Pages return HTML; JSON is only expected for API routes.
  }
  return { status: response.status, body }
}

async function expectApi(path, { status, validate, init } = {}) {
  const { status: actual, body } = await fetchJson(path, init)
  if (actual !== status) throw new Error(`expected HTTP ${status}, got ${actual}`)
  if (validate) validate(body)
}

async function expectPage(path) {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'kpop-tracker-smoke' },
  })
  if (response.status !== 200) throw new Error(`expected HTTP 200, got ${response.status}`)
  const html = await response.text()
  if (html.includes('<title>')) return `html ${html.length}B`
  throw new Error('response has no <title> — likely a fallback error page')
}

const requireRows = (label) => (body) => {
  if (!body?.success) throw new Error(`${label}: success !== true`)
  if (!Array.isArray(body.data) || body.data.length === 0) {
    throw new Error(`${label}: expected rows, got ${JSON.stringify(body.data)?.slice(0, 120)}`)
  }
}

await check('GET /api/releases/timeline returns releases', async () => {
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await expectApi('/api/releases/timeline', { status: 200, validate: requireRows('timeline') })
      const { body } = await fetchJson('/api/releases/timeline')
      return `${body.data.length} releases`
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 5000 * attempt))
    }
  }
  throw lastError
})

await check('GET /api/releases returns rows with artwork field', async () => {
  const { status, body } = await fetchJson('/api/releases?limit=5')
  if (status !== 200) throw new Error(`expected HTTP 200, got ${status}`)
  if (!body?.success || !Array.isArray(body.data) || body.data.length === 0) {
    throw new Error('no rows')
  }
  if (!('artwork' in body.data[0])) throw new Error('missing artwork field')
  return `${body.data.length} rows`
})

await check('GET /api/groups/IVE returns discography releases', async () => {
  const { status, body } = await fetchJson('/api/groups/IVE')
  if (status !== 200) throw new Error(`expected HTTP 200, got ${status}`)
  const count = body?.data?.releaseCount || 0
  if (count <= 0) throw new Error('releaseCount is 0')
  return `${count} releases`
})

await check('GET /api/sync/status returns sync badge data', async () => {
  const { status, body } = await fetchJson('/api/sync/status')
  if (status !== 200) throw new Error(`expected HTTP 200, got ${status}`)
  if (!body?.data?.last_synced) throw new Error('last_synced missing')
  if (!body?.data?.total) throw new Error('total missing')
  return `${body.data.total} cards, last sync ${body.data.last_synced}`
})

await check('GET /api/stores returns stores', async () => {
  await expectApi('/api/stores', { status: 200, validate: requireRows('stores') })
})

await check('GET /api/sync/group rejects anonymous calls (401)', async () => {
  const { status } = await fetchJson('/api/sync/group?group=IVE')
  if (status !== 401) throw new Error(`expected 401, got ${status}`)
})

await check('POST /api/cron/sync rejects anonymous calls (401)', async () => {
  const { status } = await fetchJson('/api/cron/sync', { method: 'POST' })
  if (status !== 401) throw new Error(`expected 401, got ${status}`)
})

for (const page of ['/', '/browse', '/collection', '/releases', '/releases?group=IVE', '/groups/IVE', '/releases/IVE/secret']) {
  await check(`GET ${page} renders`, () => expectPage(page))
}

console.log(failed === 0 ? '\nSmoke test passed.' : `\nSmoke test FAILED (${failed}).`)
process.exit(failed === 0 ? 0 : 1)
