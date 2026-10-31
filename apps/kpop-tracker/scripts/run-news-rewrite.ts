/**
 * AI rewrite entry point (GitHub Actions).
 *
 * Turns the articles the news pipeline collected into Indonesian fanbase-blog
 * **drafts** with Gemini. Drafts are reviewed by an admin before anything is
 * published — this script never publishes.
 *
 * Usage:
 *   bun run scripts/run-news-rewrite.ts [--dry]
 *
 * Environment:
 *   TURSO_DATABASE_URL   (required) libsql:// connection string
 *   TURSO_AUTH_TOKEN     (required)
 *   GEMINI_API_KEYS      (required) one or more keys, comma-separated
 *   GEMINI_MODEL         optional, defaults to a Flash model
 *   REWRITE_*            optional tuning knobs (see .env.example)
 *
 * Exit codes:
 *   0 — run finished (ok / partial; see the summary for details)
 *   1 — hard error (DB unreachable, uncaught exception)
 */

import { runRewrite } from '../server/utils/news/rewrite/run'
import { rewriteConfig } from '../server/utils/news/rewrite/config'

const dryRun = process.argv.includes('--dry')

if (!process.env.TURSO_DATABASE_URL) {
  console.error('❌  TURSO_DATABASE_URL is not set.')
  process.exit(1)
}
if (!process.env.TURSO_AUTH_TOKEN) {
  console.error('❌  TURSO_AUTH_TOKEN is not set.')
  process.exit(1)
}
if (!rewriteConfig().geminiApiKeys.length) {
  console.error('❌  GEMINI_API_KEYS is not set — nothing can be generated.')
  console.error('    Add it as a GitHub Actions secret (Settings → Secrets and variables → Actions).')
  process.exit(1)
}

const ISO_NOW = () => new Date().toISOString()

function log(message: string) {
  process.stdout.write(`[${ISO_NOW()}] ${message}\n`)
}

function section(title: string) {
  log(`── ${title} ${'─'.repeat(Math.max(0, 56 - title.length))}`)
}

section('News rewrite starting')
log(`Model:      ${rewriteConfig().geminiModel}`)
log(`Max/run:    ${process.env.REWRITE_MAX_PER_RUN ?? '5'}`)
log(`Keys:       ${rewriteConfig().geminiApiKeys.length}`)
log(`Dry run:    ${dryRun ? 'yes (nothing is written)' : 'no'}`)

let exitCode = 0

try {
  const summary = await runRewrite({ dryRun })

  section('Rewrite complete')
  log(`Status:      ${summary.status}`)
  log(`Candidates:  ${summary.candidates}`)
  log(`Drafts:      ${summary.generated}`)
  log(`Failed:      ${summary.failed}`)
  log(`Provider:    ${summary.provider} (${summary.model})`)
  log(`Keys used:   ${summary.keys.used.join(', ') || '—'}`)
  log(`Keys cooling:${summary.keys.cooling.length ? ` ${summary.keys.cooling.join(', ')}` : ' —'}`)

  if (summary.messages.length) {
    section('Details')
    for (const message of summary.messages) log(`  ${message}`)
  }

  // A dry run writes nothing, so print what it would have written.
  if (dryRun && summary.previews.length) {
    for (const draft of summary.previews) {
      section(`DRAFT — ${draft.title}`)
      log(`dek        : ${draft.dek}`)
      log(`waktu baca : ${draft.readingMinutes} menit`)
      log(`artis      : ${draft.artistId} · kategori: ${draft.category}`)
      log('')
      for (const line of draft.bodyMarkdown.split('\n')) log(`  ${line}`)
      log('')
      log('Gambar:')
      for (const image of draft.images) {
        log(`  - kredit: ${image.creditText || '(tanpa kredit)'} | ${image.imageUrl.slice(0, 100)}`)
      }
      log('Sumber:')
      for (const source of draft.sources) {
        log(`  - ${source.publisherName || source.publisherDomain || '?'} | ${source.sourceUrl}`)
      }
    }
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    const lines: string[] = [
      '### News rewrite run',
      '',
      '| Field | Value |',
      '| --- | --- |',
      `| status | ${summary.status} |`,
      `| candidates | ${summary.candidates} |`,
      `| drafts | ${summary.generated} |`,
      `| failed | ${summary.failed} |`,
      `| provider | ${summary.provider} (${summary.model}) |`,
      `| keys_used | ${summary.keys.used.join(', ') || '—'} |`,
      `| keys_cooling | ${summary.keys.cooling.join(', ') || '—'} |`,
      `| dry_run | ${dryRun} |`,
    ]
    if (summary.messages.length) {
      lines.push('', '#### Details', '```', ...summary.messages.slice(0, 50), '```')
    }
    const { appendFileSync } = await import('node:fs')
    appendFileSync(summaryPath, lines.join('\n') + '\n')
  }

  if (summary.status === 'error') {
    log('❌  Rewrite reported status=error — see details above.')
    exitCode = 1
  } else if (summary.status === 'skipped') {
    log('⚠️  Nothing to do (rewrite disabled or unconfigured).')
  } else {
    log('✅  Rewrite finished.')
  }
} catch (err) {
  section('Rewrite threw an unhandled exception')
  console.error(err)
  exitCode = 1
}

process.exit(exitCode)
