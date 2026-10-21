import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Guards the one class of mistake that ISR turns from staleness into a leak.
 *
 * `app/pages/status.vue` renders against the visitor's own session: its HTML
 * contains the admin error log (stack traces, file paths) and sync history.
 * `/collection` likewise renders per-user collection rows. ISR caches by URL and
 * ignores cookies, so caching either would serve one person's private HTML to
 * every visitor who asks for that URL afterwards.
 *
 * The public pages are the opposite case and *should* be cached — those two
 * assertions exist so that nobody "fixes" this file by removing ISR entirely.
 */
const CONFIG = fileURLToPath(new URL('../nuxt.config.ts', import.meta.url))

/**
 * Read as text rather than imported: `defineNuxtConfig` is auto-imported by
 * Nuxt's build, not by the plain-node vitest environment, so a real import
 * would throw before the assertions could run.
 */
function routeRulesBody(): string {
  const src = readFileSync(CONFIG, 'utf8')
  const at = src.indexOf('routeRules: {')
  expect(at, 'routeRules block not found in nuxt.config.ts').toBeGreaterThan(-1)

  // Brace-match to the block's end so a rule can only be judged by what is
  // actually inside it, not by whatever happens to follow in the file.
  const open = src.indexOf('{', at)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i)
  }
  throw new Error('unbalanced braces in routeRules')
}

describe('routeRules cache safety', () => {
  const body = routeRulesBody()

  // [label, pattern] — `it.each` spreads a row into separate arguments and
  // formats the first with %s, so the label comes first to keep failures
  // readable ("/status is not given isr or swr", not a raw RegExp).
  const PER_USER: Array<[string, RegExp]> = [
    ['/status', /['"]\/status['"]/],
    ['/collection', /['"]\/collection['"]/],
  ]
  const PUBLIC: Array<[string, RegExp]> = [
    ['/', /['"]\/['"]/],
    ['/browse', /['"]\/browse['"]/],
    ['/releases', /['"]\/releases['"]/],
  ]

  it.each(PER_USER)('%s is not given isr or swr', (_label, pathRe) => {
    // Absent from routeRules entirely is the expected state, and also the
    // safest: no rule means nothing to get wrong.
    const rule = new RegExp(`${pathRe.source}\\s*:\\s*\\{([^}]*)\\}`).exec(body)
    if (!rule) return
    expect(rule[1]).not.toMatch(/\bisr\b/)
    expect(rule[1]).not.toMatch(/\bswr\b/)
  })

  it.each(PUBLIC)('%s keeps its isr rule', (_label, pathRe) => {
    expect(body).toMatch(new RegExp(`${pathRe.source}\\s*:\\s*\\{[^}]*\\bisr\\b`))
  })
})
