import { describe, expect, it } from 'vitest'
import { withCsp } from '../server/utils/csp'

// Predictable, because the point of several of these assertions is that the
// header and the body carry the *same* nonce. The plugin generates a random one
// per response; a test that could not predict it could not catch them drifting
// apart, which is the failure mode that ships a blank site.
const NONCE = 'TESTNONCE0123456789abc='

/** The five script tags Nuxt emits per page, in production order and shape. */
const PAGE = [
  '<script type="importmap">{"imports":{"#entry":"/_nuxt/CQD1lQct.js"}}</script>',
  "<script>(function(){try{var t=localStorage.getItem('theme');}catch(e){}})()</script>",
  '<script type="module" src="/_nuxt/CQD1lQct.js" crossorigin></script>',
  '<script>window.__NUXT__={};window.__NUXT__.config={public:{apiBaseUrl:""}}</script>',
  '<script type="application/json" data-nuxt-data="nuxt-app" id="__NUXT_DATA__">[["a",1]]</script>',
].join('\n')

describe('withCsp', () => {
  it('nonces exactly the three inline scripts that execute', () => {
    const { body } = withCsp(PAGE, '/', NONCE)
    const nonced = body.match(new RegExp(`<script[^>]*nonce="${NONCE}"`, 'g')) || []
    expect(nonced).toHaveLength(3)
  })

  it('puts the same nonce in the header and in the body', () => {
    const { body, csp } = withCsp(PAGE, '/', NONCE)
    const headerNonce = /script-src[^;]*'nonce-([^']+)'/.exec(csp)?.[1]

    expect(headerNonce).toBe(NONCE)
    // The literal '${nonce}' means the string was written with " instead of
    // backticks and never interpolated. The browser rejects that source and
    // then blocks every inline script, so the app dies at createNuxtApp.
    expect(csp).not.toContain('${nonce}')
    expect(body).toContain(`nonce="${headerNonce}"`)
  })

  it('leaves the external module script and the JSON payload untouched', () => {
    const { body } = withCsp(PAGE, '/', NONCE)

    // Covered by 'self'; rewriting it would add a useless nonce attribute.
    expect(body).toContain('<script type="module" src="/_nuxt/CQD1lQct.js" crossorigin>')
    // Never executed, so script-src does not apply to it at all. This is the
    // largest script on the page — 17 KB — and must survive byte-identical or
    // hydration breaks.
    expect(body).toContain(
      '<script type="application/json" data-nuxt-data="nuxt-app" id="__NUXT_DATA__">',
    )
  })

  it('keeps the payload body byte-identical', () => {
    const payload = '[["ShallowReactive",1],{"data":2}]'
    const { body } = withCsp(`<script type="application/json" id="__NUXT_DATA__">${payload}</script>`, '/', NONCE)
    expect(body).toContain(payload)
  })

  it('drops only script-src on /shop and keeps the rest of the policy', () => {
    const { csp } = withCsp(PAGE, '/shop', NONCE)

    // TikTok's embed pulls scripts from rotating CDN domains, so pinning
    // script-src here would break the page instead of protecting it.
    expect(csp).not.toContain('script-src')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('allows the Vercel analytics origin', () => {
    const { csp } = withCsp(PAGE, '/', NONCE)
    expect(csp).toContain('https://va.vercel-scripts.com')
  })

  it('permits WebAssembly without permitting eval', () => {
    const { csp } = withCsp(PAGE, '/', NONCE)

    // /identify compiles an ONNX model through WebAssembly.compile, and
    // script-src governs that call. Without this source the page fails at
    // model-init for every visitor, while every other page and every CSP
    // violation count looks healthy — the compile is only attempted once
    // somebody uploads a photo. Removing it is silent, so it is asserted.
    expect(csp).toContain("'wasm-unsafe-eval'")

    // Distinct source, not a synonym: 'unsafe-eval' would additionally permit
    // eval() and Function(), which is a far wider hole than compiling wasm
    // bytes. The leading quote is part of the match so this fails if anyone
    // "simplifies" the directive to plain 'unsafe-eval'.
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('generates a distinct policy per call', () => {
    const a = withCsp(PAGE, '/', 'nonceA')
    const b = withCsp(PAGE, '/', 'nonceB')
    expect(a.csp).not.toBe(b.csp)
    expect(a.csp).toContain("'nonce-nonceA'")
    expect(b.csp).toContain("'nonce-nonceB'")
  })
})
