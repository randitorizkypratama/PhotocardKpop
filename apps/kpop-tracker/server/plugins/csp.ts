import { randomBytes } from 'node:crypto'
import { withCsp } from '../utils/csp'

/**
 * Attaches the CSP built by `withCsp` to every rendered response, stamping a
 * fresh nonce into that response's inline script tags.
 *
 * The nonce has to be per-response, which is why this is a hook and not a
 * `routeRules` header — see the note in ../utils/csp.ts.
 *
 * ## Caching
 *
 * ISR stores the whole response, nonce included, so the header and the HTML
 * stay consistent for the life of the entry. A nonce that lives for 10 minutes
 * still blocks injection — an injected script has no way to learn it — it is
 * only *predictability across visitors* that would defeat it.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response, { event }) => {
    const html = response.body
    if (typeof html !== 'string' || !html.includes('<script')) return

    const path = String(event.path || '/').split('?')[0] ?? '/'
    const { body, csp } = withCsp(html, path, randomBytes(16).toString('base64'))

    response.body = body
    response.headers = {
      ...(response.headers || {}),
      'Content-Security-Policy': csp,
    }
  })
})
