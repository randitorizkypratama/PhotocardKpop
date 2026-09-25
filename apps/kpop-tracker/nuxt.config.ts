// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/google-fonts',
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
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/hibikishop-logo.png' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
      script: [
        {
          innerHTML: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');}catch(e){}})();`,
        },
      ],
    },
  },

  nitro: {
    routeRules: {
      '/api/**': { cors: true },
    },
  },
})
