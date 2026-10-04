<script setup lang="ts">
import { ExternalLink, Play, Link2, RefreshCw, Video, PackageOpen } from 'lucide-vue-next'
import { SHOP_URLS, shopProducts } from '@/lib/shop'
import { safeExternalUrl } from '@/lib/url'

declare global {
  interface Window {
    tiktokEmbedLoaded?: () => void
  }
}

useHead({ title: 'Shop — HIBIKISHOP PC' })
const { t } = useLocale()
useSeoMeta({
  ogTitle: 'Shop — HIBIKISHOP PC',
  ogDescription: () => t('shop.ogDescription'),
  ogUrl: 'https://kpop-tracker-six.vercel.app/shop',
})

const route = useRoute()

const { user } = useAuth()
const isAdmin = computed(() => user.value?.role === 'admin')

const embedRoot = ref<HTMLElement | null>(null)
const embedReady = ref(false)

const tiktokStatus = ref<{ configured: boolean; connected: boolean }>({ configured: false, connected: false })
const videos = ref<any[]>([])
const videosLoading = ref(false)
const videosError = ref('')
const products = ref<any[]>([])
const productsLoading = ref(false)
const productsNote = ref('')

onMounted(() => {
  loadEmbedScript()
  if (embedRoot.value && window.tiktokEmbedLoaded) {
    window.tiktokEmbedLoaded()
    embedReady.value = true
  }
  initTikTok()
})

async function initTikTok() {
  await Promise.all([loadStatus(), loadVideos(false), loadProducts()])
}

async function loadStatus() {
  try {
    const res = await $fetch<any>('/api/tiktok/status')
    tiktokStatus.value = {
      configured: Boolean(res.configured),
      connected: Boolean(res.connected),
    }
  } catch {
    tiktokStatus.value = { configured: false, connected: false }
  }
}

async function loadVideos(force = false) {
  videosLoading.value = true
  videosError.value = ''
  try {
    const res = await $fetch<any>(`/api/tiktok/videos${force ? '?refresh=1' : ''}`)
    videos.value = res.videos || []
  } catch (e: any) {
    videosError.value = e?.data?.statusMessage || e?.message || t('shop.videosError')
    videos.value = []
  } finally {
    videosLoading.value = false
  }
}

async function loadProducts() {
  productsLoading.value = true
  productsNote.value = ''
  try {
    const res = await $fetch<any>('/api/tiktok/products')
    products.value = res.products || []
    if (!res.configured) {
      productsNote.value = t('shop.productsNoteConfig')
    } else if (products.value.length === 0) {
      productsNote.value = t('shop.productsNoteNone')
    }
  } catch (e: any) {
    products.value = []
    productsNote.value = e?.data?.statusMessage || t('shop.productsNoteError')
  } finally {
    productsLoading.value = false
  }
}

function formatDuration(sec?: number) {
  if (!sec && sec !== 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(ts?: number) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const connectedNotice = computed(() => {
  if (route.query.tiktok_connected) return t('shop.connected')
  if (route.query.tiktok_error) return t('shop.connectError', { error: String(route.query.tiktok_error) })
  return ''
})

function loadEmbedScript() {
  if (document.querySelector('script[src="https://www.tiktok.com/embed.js"]')) {
    embedReady.value = true
    return
  }
  const script = document.createElement('script')
  script.src = 'https://www.tiktok.com/embed.js'
  script.async = true
  script.onload = () => {
    embedReady.value = true
    if (typeof window.tiktokEmbedLoaded === 'function') {
      window.tiktokEmbedLoaded()
    }
  }
  document.body.appendChild(script)
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader back active="shop" />

    <main>
      <section class="border-b border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-8 sm:py-10">
          <p class="eyebrow">{{ t('shop.eyebrow') }}</p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {{ t('shop.title') }}
          </h1>
          <p class="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {{ t('shop.desc') }}
          </p>

          <div class="mt-5 flex flex-wrap gap-2">
            <Button class="h-10 rounded-lg" as-child>
              <a :href="SHOP_URLS.shopee" target="_blank" rel="noopener noreferrer">
                <img src="/social/shopee.svg" alt="" class="h-4 w-4" aria-hidden="true" />
                Shopee
              </a>
            </Button>
            <Button variant="outline" class="h-10 rounded-lg" as-child>
              <a :href="SHOP_URLS.tokopedia" target="_blank" rel="noopener noreferrer">
                <img src="/social/tokopedia.png" alt="" class="h-4 w-4" aria-hidden="true" />
                Tokopedia
              </a>
            </Button>
            <Button variant="outline" class="h-10 rounded-lg" as-child>
              <a :href="SHOP_URLS.tiktok" target="_blank" rel="noopener noreferrer">
                <img src="/social/tiktok.svg" alt="" class="h-4 w-4" aria-hidden="true" />
                TikTok
              </a>
            </Button>
          </div>

          <p
            v-if="connectedNotice"
            class="mt-4 rounded-lg border px-3 py-2 text-sm"
            :class="route.query.tiktok_error
              ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200'"
          >
            {{ connectedNotice }}
          </p>
        </div>
      </section>

      <!-- TikTok Shop products (Seller API) -->
      <section class="page-shell py-10 sm:py-12">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
          <div>
            <p class="eyebrow">TikTok Shop</p>
            <h2 class="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {{ t('shop.productsTitle') }}
            </h2>
          </div>
          <Button
            v-if="products.length > 0"
            variant="ghost"
            size="sm"
            class="gap-1.5 rounded-lg text-muted-foreground"
            :disabled="productsLoading"
            @click="loadProducts()"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="productsLoading ? 'animate-spin' : ''" />
            {{ t('shop.refresh') }}
          </Button>
        </div>

        <div v-if="productsLoading && products.length === 0" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="i in 3" :key="i" class="pc-skeleton rounded-xl">
            <div class="skeleton-block aspect-square" />
            <div class="space-y-2.5 p-4">
              <div class="skeleton-block h-3.5 w-3/4" />
              <div class="skeleton-block h-4 w-1/3" />
            </div>
          </div>
        </div>

        <div
          v-else-if="products.length === 0"
          class="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700"
        >
          <PackageOpen class="mx-auto h-7 w-7 text-zinc-400" aria-hidden="true" />
          <p class="mt-3 text-sm font-medium text-foreground">{{ t('shop.productsEmpty') }}</p>
          <p class="mt-1 text-sm text-muted-foreground">{{ productsNote || t('shop.productsEmptyHint') }}</p>
        </div>

        <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <article
            v-for="p in products"
            :key="p.id"
            class="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800"
          >
            <div class="aspect-square bg-zinc-100 dark:bg-zinc-900">
              <img
                v-if="p.image"
                :src="p.image"
                :alt="p.title"
                class="h-full w-full object-cover"
                loading="lazy"
              />
              <div v-else class="flex h-full items-center justify-center text-zinc-400">
                <PackageOpen class="h-8 w-8" aria-hidden="true" />
              </div>
            </div>
            <div class="flex flex-1 flex-col p-4">
              <h3 class="line-clamp-2 text-sm font-semibold text-foreground">{{ p.title }}</h3>
              <p v-if="p.price != null" class="mt-1 text-sm font-medium tabular-nums text-muted-foreground">
                {{ p.currency || '' }} {{ p.price }}
              </p>
              <Button class="mt-3 h-9 w-full gap-2 rounded-lg" as-child>
                <a :href="safeExternalUrl(p.url, SHOP_URLS.tiktok)" target="_blank" rel="noopener noreferrer">
                  {{ t('shop.buy') }}
                  <ExternalLink class="h-4 w-4" />
                </a>
              </Button>
            </div>
          </article>
        </div>
      </section>

      <!-- Featured collections (manual fallback) -->
      <section class="border-t border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-10 sm:py-12">
          <div class="mb-5 sm:mb-6">
            <p class="eyebrow">{{ t('shop.featuredEyebrow') }}</p>
            <h2 class="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {{ t('shop.featuredTitle') }}
            </h2>
          </div>

          <div class="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article
              v-for="product in shopProducts"
              :key="product.id"
              class="group flex flex-col rounded-xl border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-6"
              :class="product.accent"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2">
                  <span class="h-2 w-2 shrink-0 rounded-full" :class="product.dot" aria-hidden="true" />
                  <h3 class="text-base font-semibold text-foreground sm:text-lg">{{ t(product.nameKey) }}</h3>
                </div>
                <span
                  v-if="product.badgeKey"
                  class="shrink-0 rounded-md border border-zinc-200 bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200"
                >
                  {{ t(product.badgeKey) }}
                </span>
              </div>

              <p class="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {{ t(product.descKey) }}
              </p>

              <Button class="mt-4 h-10 w-full gap-2 rounded-lg" as-child>
                <a :href="product.href" target="_blank" rel="noopener noreferrer">
                  {{ t(product.ctaKey) }}
                  <ExternalLink class="h-4 w-4" />
                </a>
              </Button>
            </article>
          </div>
        </div>
      </section>

      <!-- TikTok videos via Display API -->
      <section class="border-t border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-10 sm:py-12">
          <div class="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
            <div>
              <p class="eyebrow">TikTok</p>
              <h2 class="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {{ t('shop.videosTitle') }}
              </h2>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                v-if="videos.length > 0"
                variant="ghost"
                size="sm"
                class="gap-1.5 rounded-lg text-muted-foreground"
                :disabled="videosLoading"
                @click="loadVideos(true)"
              >
                <RefreshCw class="h-3.5 w-3.5" :class="videosLoading ? 'animate-spin' : ''" />
                {{ t('shop.refresh') }}
              </Button>
              <a
                :href="SHOP_URLS.tiktok"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {{ t('shop.openTikTok') }}
                <ExternalLink class="h-4 w-4" />
              </a>
            </div>
          </div>

          <!-- Connect prompt -->
          <div
            v-if="isAdmin && tiktokStatus.configured && !tiktokStatus.connected"
            class="rounded-xl border border-zinc-200 bg-card p-5 shadow-sm dark:border-zinc-800 sm:p-6"
          >
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <Link2 class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <p class="text-sm font-semibold text-foreground">{{ t('shop.connectTitle') }}</p>
                </div>
                <p class="mt-1 text-sm text-muted-foreground">
                  {{ t('shop.connectDescA') }}<code class="text-xs">video.list</code>{{ t('shop.connectDescB') }}
                </p>
              </div>
              <Button class="h-10 shrink-0 gap-2 rounded-lg" as-child>
                <a href="/api/tiktok/auth">
                  <Video class="h-4 w-4" />
                  {{ t('shop.connect') }}
                </a>
              </Button>
            </div>
          </div>

          <!-- Videos grid -->
          <div v-else-if="videosLoading && videos.length === 0" class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            <div v-for="i in 4" :key="i" class="pc-skeleton rounded-xl">
              <div class="skeleton-block aspect-[9/14]" />
              <div class="space-y-2.5 p-3">
                <div class="skeleton-block h-3 w-3/4" />
                <div class="skeleton-block h-3 w-1/2" />
              </div>
            </div>
          </div>

          <div
            v-else-if="videos.length === 0"
            class="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700"
          >
            <Video class="mx-auto h-7 w-7 text-zinc-400" aria-hidden="true" />
            <p class="mt-3 text-sm font-medium text-foreground">{{ t('shop.videosEmpty') }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ videosError || t('shop.videosEmptyHint') }}</p>
            <Button v-if="isAdmin && tiktokStatus.configured" class="mt-4 h-10 gap-2 rounded-lg" as-child>
              <a href="/api/tiktok/auth">
                <Link2 class="h-4 w-4" />
                {{ t('shop.connect') }}
              </a>
            </Button>
          </div>

          <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            <a
              v-for="video in videos"
              :key="video.id"
              :href="safeExternalUrl(video.share_url || video.embed_link, SHOP_URLS.tiktok)"
              target="_blank"
              rel="noopener noreferrer"
              class="group overflow-hidden rounded-xl border border-zinc-200 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800"
            >
              <div class="relative aspect-[9/14] bg-zinc-100 dark:bg-zinc-900">
                <img
                  v-if="video.cover_image_url"
                  :src="video.cover_image_url"
                  :alt="video.title || video.video_description || t('shop.videoAlt')"
                  class="h-full w-full object-cover"
                  loading="lazy"
                />
                <div class="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                  <Play class="h-8 w-8 text-white opacity-0 drop-shadow transition group-hover:opacity-100" aria-hidden="true" />
                </div>
                <span
                  v-if="video.duration"
                  class="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
                >
                  {{ formatDuration(video.duration) }}
                </span>
              </div>
              <div class="p-3">
                <p class="line-clamp-2 text-sm font-medium text-foreground">
                  {{ video.title || video.video_description || t('shop.untitled') }}
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ formatDate(video.create_time) }}
                  <span v-if="video.view_count != null" class="ml-2 tabular-nums">{{ video.view_count }} {{ t('shop.views') }}</span>
                </p>
              </div>
            </a>
          </div>

          <!-- Official profile embed fallback -->
          <div class="mt-6 rounded-xl border border-zinc-200 bg-card p-4 shadow-sm dark:border-zinc-800 sm:p-6">
            <p class="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {{ t('shop.liveEmbed') }}
            </p>
            <ClientOnly>
              <div ref="embedRoot" class="tiktok-embed-root min-h-[280px]">
                <blockquote
                  class="tiktok-embed"
                  cite="https://www.tiktok.com/@hibikis13"
                  data-unique-id="hibikis13"
                  data-embed-from="oembed"
                  data-embed-type="creator"
                  style="max-width: 780px; min-width: 288px"
                >
                  <section>
                    <a target="_blank" href="https://www.tiktok.com/@hibikis13?refer=creator_embed">@hibikis13</a>
                  </section>
                </blockquote>
              </div>
              <template #fallback>
                <div class="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-zinc-300 text-sm text-muted-foreground dark:border-zinc-700">
                  {{ t('shop.loading') }}
                </div>
              </template>
            </ClientOnly>
          </div>
        </div>
      </section>
    </main>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>

<style scoped>
.tiktok-embed-root :deep(.tiktok-embed) {
  margin: 0 auto;
}
</style>
