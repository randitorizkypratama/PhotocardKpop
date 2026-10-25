/**
 * Standalone news pipeline entry point for GitHub Actions.
 *
 * Runs the full fetch → normalize → deduplicate → verify → store pipeline
 * directly on the runner, with no HTTP call to the Vercel deployment.
 *
 * Usage:
 *   bun run scripts/run-news-pipeline.ts
 *
 * Required environment variables (set as GitHub Actions secrets):
 *   TURSO_DATABASE_URL   — libsql:// connection string for the Turso database
 *   TURSO_AUTH_TOKEN     — Turso authentication token
 *
 * Optional tuning variables (same as the Vercel deployment, same defaults):
 *   NEWS_FETCH_TIMEOUT        NEWS_MAX_ARTICLES_PER_RUN
 *   NEWS_RUN_BUDGET_MS        NEWS_MAX_RETRIES
 *   NEWS_MAX_RESPONSE_BYTES   NEWS_MAX_AGE_DAYS
 *   NEWS_HOST_MIN_INTERVAL_MS NEWS_HOST_COOLDOWN_MS
 *   NEWS_SITEMAP_MAX_BYTES    NEWS_RECHECK_INTERVAL
 *   VERIFICATION_MIN_SCORE    ALLOWED_SOURCE_DOMAINS
 *   YOUTUBE_API_KEY
 *
 * Exit codes:
 *   0 — pipeline completed (ok or partial — partial means no new articles,
 *       which is expected when there is nothing new today)
 *   1 — pipeline encountered a hard error (DB unreachable, uncaught exception)
 */

import { runNewsIngestion } from '../server/utils/news/run'

// ── Guard: credentials must be present before we touch the database ──────────
if (!process.env.TURSO_DATABASE_URL) {
  console.error('❌  TURSO_DATABASE_URL is not set.')
  console.error('    Add it as a GitHub Actions secret (Settings → Secrets and variables → Actions).')
  process.exit(1)
}
if (!process.env.TURSO_AUTH_TOKEN) {
  console.error('❌  TURSO_AUTH_TOKEN is not set.')
  console.error('    Add it as a GitHub Actions secret (Settings → Secrets and variables → Actions).')
  process.exit(1)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ISO_NOW = () => new Date().toISOString()

function log(msg: string) {
  // Include a timestamp so GitHub Actions raw logs are easy to correlate.
  process.stdout.write(`[${ISO_NOW()}] ${msg}\n`)
}

function section(title: string) {
  log(`── ${title} ${'─'.repeat(Math.max(0, 56 - title.length))}`)
}

// ── Run ───────────────────────────────────────────────────────────────────────
section('News pipeline starting')
log(`Budget: ${process.env.NEWS_RUN_BUDGET_MS ?? '120000'} ms`)
log(`Max articles: ${process.env.NEWS_MAX_ARTICLES_PER_RUN ?? '9'}`)
log(`Verification min-score: ${process.env.VERIFICATION_MIN_SCORE ?? '90'}`)

let exitCode = 0

try {
  const summary = await runNewsIngestion()

  section('Pipeline complete')
  log(`Status:           ${summary.status}`)
  log(`Started:          ${summary.startedAt}`)
  log(`Finished:         ${summary.finishedAt}`)
  log(`Discovered:       ${summary.discovered}`)
  log(`Verified:         ${summary.verified}`)
  log(`Pending:          ${summary.pending}`)
  log(`Rejected:         ${summary.rejected}`)
  log(`Fetch failed:     ${summary.fetchFailed}`)
  log(`Re-checked:       ${summary.rechecked}`)

  if (summary.sources.length) {
    section('Source availability')
    for (const src of summary.sources) {
      const errPart = src.error ? ` — ${src.error}` : ''
      log(`  ${src.id}: ${src.availability} (${src.itemCount} items)${errPart}`)
    }
  }

  if (summary.messages.length) {
    section('Article decisions')
    for (const msg of summary.messages) {
      log(`  ${msg}`)
    }
  }

  // Write GitHub Actions job summary if running inside Actions.
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    const lines: string[] = [
      '### News pipeline run',
      '',
      '| Field | Value |',
      '| --- | --- |',
      `| status | ${summary.status} |`,
      `| discovered | ${summary.discovered} |`,
      `| verified | ${summary.verified} |`,
      `| pending | ${summary.pending} |`,
      `| rejected | ${summary.rejected} |`,
      `| fetch_failed | ${summary.fetchFailed} |`,
      `| rechecked | ${summary.rechecked} |`,
      `| started_at | ${summary.startedAt} |`,
      `| finished_at | ${summary.finishedAt} |`,
    ]

    if (summary.sources.length) {
      lines.push('', '#### Sources')
      lines.push('| Source | Status | Items | Error |')
      lines.push('| --- | --- | --- | --- |')
      for (const src of summary.sources) {
        lines.push(`| ${src.id} | ${src.availability} | ${src.itemCount} | ${src.error ?? '—'} |`)
      }
    }

    if (summary.messages.length) {
      lines.push('', '#### Article decisions')
      lines.push('```')
      lines.push(...summary.messages.slice(0, 50))
      lines.push('```')
    }

    // Append-safe write — other steps may have written to the file already.
    const { appendFileSync } = await import('node:fs')
    appendFileSync(summaryPath, lines.join('\n') + '\n')
  }

  if (summary.status === 'error') {
    log('❌  Pipeline reported status=error — see messages above.')
    exitCode = 1
  } else {
    log('✅  Pipeline finished successfully.')
  }
} catch (err) {
  section('Pipeline threw an unhandled exception')
  console.error(err)
  exitCode = 1
}

process.exit(exitCode)
