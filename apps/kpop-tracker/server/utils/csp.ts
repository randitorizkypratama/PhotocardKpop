/**
 * Content-Security-Policy for a rendered page, and the nonce it depends on.
 *
 * Split out of `server/plugins/csp.ts` purely so it can be imported by
 * tests/csp.test.ts: that file also calls `defineNitroPlugin`, which is a Nuxt
 * auto-import and does not exist under the plain-node vitest environment.
 */

/**
 * ## Why this cannot live in routeRules
 *
 * A nonce that is the same for every visitor is not a nonce: an attacker who
 * can read it once — and the header is readable from the page — just uses it in
 * the payload they inject. A static route rule can only ever emit one value, so
 * it would advertise protection that does not exist. The policy has to be
 * attached to the response, with the matching nonce stamped into the tags at
 * the same time.
 *
 * ## What needs authorising
 *
 * Per rendered page Nuxt emits five `<script>` tags, and only three execute:
 *
 *   1. `type="importmap"` (43 B) — subject to script-src, needs the nonce
 *   2. the theme bootstrap (252 B) — inline, needs the nonce
 *   3. `src="/_nuxt/<hash>.js"` — same origin, covered by 'self'
 *   4. `window.__NUXT__` runtime config (166 B) — inline, needs the nonce
 *   5. `type="application/json"` payload (17 KB) — never executed, so CSP does
 *      not apply and it is excluded from rewriting. Noncing it would add a
 *      per-response byte to the largest script on the page for no gain.
 *
 * The payload is the one thing that makes rewriting the HTML risky: it is a big
 * string of application data, and if a card name ever contained `<script` the
 * replace below could match inside it and corrupt hydration. Nuxt serialises
 * the payload with devalue, which escapes `<`, so that cannot happen — the
 * pattern can only ever see real tags.
 *
 * ## Why /shop is exempt
 *
 * `loadEmbedScript()` injects `https://www.tiktok.com/embed.js`, which then
 * loads further scripts from TikTok's static CDN domains. That list is not
 * stable and cannot be enumerated from this repo, so pinning script-src there
 * would break the page rather than protect it. Every other page is covered.
 */
export function withCsp(html: string, path: string, nonce: string): { body: string, csp: string } {
  // Everything except a tag that is either external (has src, allowed by
  // 'self') or inert (application/json, not executed).
  const INLINE_SCRIPT = /<script(?![^>]*\bsrc\s*=)(?![^>]*type\s*=\s*["']application\/json["'])([^>]*)>/g

  const body = html.replace(INLINE_SCRIPT, (_tag, attrs: string) =>
    `<script nonce="${nonce}"${attrs}>`,
  )

  const directives = [
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    // No default-src: leaving the other fetch directives unrestricted keeps
    // this surgical. Images, XHR, fonts and styles behave exactly as before, so
    // the only way this can break a page is by blocking a script — which is the
    // thing worth blocking.
    //
    // va.vercel-scripts.com is @vercel/analytics/nuxt, which injects its beacon
    // from that origin rather than from /_vercel/ — found by running this policy
    // locally, where every page logged a violation. Losing it would be silent:
    // analytics never throws, it just stops reporting.
    ...(path === '/shop' || path.startsWith('/shop/')
      ? []
      : [
          // Backticks, not quotes: this has to interpolate. Written with " the
          // header literally contained 'nonce-${nonce}', which the browser
          // rejects as an invalid source and then blocks every inline script —
          // a blank site. Caught by the local violation check.
          //
          // 'wasm-unsafe-eval' is required by /identify. That page runs ONNX
          // Runtime in the browser, which compiles a WebAssembly module, and
          // script-src governs WebAssembly.compile — so without this source the
          // page fails at model-init for every visitor. It was broken in
          // production by the commit that introduced this header and no amount
          // of counting CSP violations would have found it: violations are only
          // logged when something actually attempts the compile, and that
          // happens only once a visitor uploads a photo. It was reproduced by
          // compiling a minimal module on the live page, not by watching logs.
          //
          // This is deliberately not 'unsafe-eval': it permits compiling inert
          // wasm bytes and does not permit eval() or Function(). Browsers
          // without support for the source (Chromium <97, Firefox <115) simply
          // keep blocking wasm, so the feature degrades rather than the policy
          // widening.
          `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://va.vercel-scripts.com`,
        ]),
    'upgrade-insecure-requests',
  ]

  return { body, csp: directives.join('; ') }
}
