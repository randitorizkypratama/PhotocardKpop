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
    },
  },

  nitro: {
    routeRules: {
      '/api/**': { cors: true },
    },
  },
})
