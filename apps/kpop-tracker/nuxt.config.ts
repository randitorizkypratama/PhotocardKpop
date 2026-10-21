// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/google-fonts',
    '@vercel/analytics/nuxt',
  ],

  components: [
    {
      path: '~/components',
      pathPrefix: false,
      ignore: ['**/ui/**/index.ts', '**/ui/**/interface.ts', '**/ui/**/use*.ts'],
    },
  ],

  css: ['~/assets/css/main.css'],

  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  googleFonts: {
    families: {
      'Inter': [400, 500, 600, 700],
    },
    display: 'swap',
  },

  runtimeConfig: {
    tursoDatabaseUrl: process.env.TURSO_DATABASE_URL || '',
    tursoAuthToken: process.env.TURSO_AUTH_TOKEN || '',
    tiktokClientKey: process.env.TIKTOK_CLIENT_KEY || '',
    tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    tiktokRedirectUri: process.env.TIKTOK_REDIRECT_URI || '',
    tiktokShopAccessToken: process.env.TIKTOK_SHOP_ACCESS_TOKEN || '',
    tiktokShopBaseUrl: process.env.TIKTOK_SHOP_BASE_URL || 'https://open-api.tiktokglobalshop.com',
    tiktokShopShopCipher: process.env.TIKTOK_SHOP_SHOP_CIPHER || '',
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || '',
    },
  },

  app: {
    head: {
      title: 'HIBIKISHOP PC — K-Pop Photocard Tracker',
      meta: [
        { name: 'description', content: 'Track K-pop photocard prices based on Pocamarket — by HIBIKISHOP' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { property: 'og:site_name', content: 'HIBIKISHOP PC' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: 'https://kpop-tracker-six.vercel.app' },
        { property: 'og:image', content: 'https://kpop-tracker-six.vercel.app/hibikishop-logo.png' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: 'HIBIKISHOP PC — K-Pop Photocard Tracker' },
        { name: 'twitter:description', content: 'Track K-pop photocard prices based on Pocamarket — by HIBIKISHOP' },
        { name: 'twitter:image', content: 'https://kpop-tracker-six.vercel.app/hibikishop-logo.png' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/hibikishop-logo.png' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        // Card images are on CloudFront and album art on the iTunes CDN.
        // Because these pages are server-rendered, the browser only discovers
        // both origins while parsing the <img> tags — without this it pays a
        // fresh DNS + TCP + TLS round trip before the first pixel downloads.
        // No `crossorigin`: these are plain image requests, and a mismatched
        // preconnect would not be reused by them.
        { rel: 'preconnect', href: 'https://d1sut5kn3lwnf7.cloudfront.net' },
        { rel: 'preconnect', href: 'https://is1-ssl.mzstatic.com' },
      ],
      script: [
        {
          innerHTML: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');}catch(e){}})();`,
        },
      ],
    },
  },

  nitro: {
    // /cache is what cachedEventHandler() reads and writes. On Vercel the
    // deployment bundle is read-only, so the default FS driver would fail the
    // write on every cache hit (and log it to error_log). Memory is per
    // instance, which is fine: the cross-instance cache is the edge, fed by
    // the s-maxage that `swr` sets on each cached handler.
    storage: {
      cache: { driver: 'memory' },
    },
    routeRules: {
      '/api/**': { cors: true },

      // Edge-cache the server-rendered public pages. Safe because the SSR body
      // is anonymous and identical for everyone: every auth and collection
      // fetch runs in onMounted, and the only page that reads the request
      // (status.vue forwards the session cookie) is excluded below. 600s: card
      // and release data only changes on the 17:00 UTC cron, so this trades at
      // most 10 minutes of freshness for not paying the render (measured TTFB
      // 304-586 ms) or a serverless invocation per view. Query strings are
      // distinct cache entries, so /releases?group= filters stay correct.
      //
      // tests/cache-safety.test.ts asserts that /status and /collection never
      // join this list — their HTML carries the admin error log and per-user
      // collections, so a cached copy would leak one visitor's data to the next.
      '/': { isr: 600 },
      '/browse': { isr: 600 },
      '/releases': { isr: 600 },
      '/releases/**': { isr: 600 },
      '/groups/**': { isr: 600 },
      '/card/**': { isr: 600 },

      '/**': {
        headers: {
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          // Content-Security-Policy is deliberately absent here. Constraining
          // script-src needs a per-response nonce, and a static route rule
          // cannot supply one: a nonce that is identical for every visitor is
          // readable by an attacker, so it protects nothing while looking as
          // though it does. server/plugins/csp.ts sets the policy on the
          // rendered response instead, where it can also stamp the matching
          // nonce into the inline script tags it has to authorise.
        },
      },
    },
  },
})
