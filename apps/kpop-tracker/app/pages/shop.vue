<script setup lang="ts">
import { ExternalLink, Play, Link2, RefreshCw, Video, MessageCircle, ShoppingBag, Package, CreditCard, Truck } from 'lucide-vue-next'
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
// loading → the blockquote placeholder is in the DOM waiting for TikTok;
// ready   → embed.js replaced it with its iframe;
// failed  → the script was blocked or never produced an iframe: show our own
//           card instead of leaving visitors a 280px box with one bare link.
const embedState = ref<'loading' | 'ready' | 'failed'>('loading')
let embedPoll: ReturnType<typeof setInterval> | null = null
let embedDeadline: ReturnType<typeof setTimeout> | null = null

function stopWatchingEmbed() {
  if (embedPoll) clearInterval(embedPoll)
  if (embedDeadline) clearTimeout(embedDeadline)
  embedPoll = null
  embedDeadline = null
}

function failEmbed() {
  if (embedState.value !== 'loading') return
  embedState.value = 'failed'
  stopWatchingEmbed()
}

/**
 * Succeeds only when an iframe actually exists inside embedRoot — a script
 * `onload` proves the file downloaded, not that TikTok rendered anything
 * (ad-blockers resolve the tag, slow requests never insert the iframe). The
 * deadline turns the silent case into a visible fallback instead of the empty
 * box visitors were getting.
 */
function watchEmbed() {
  if (embedState.value !== 'loading' || embedPoll) return
  embedPoll = setInterval(() => {
    if (embedRoot.value?.querySelector('iframe')) {
      embedState.value = 'ready'
      stopWatchingEmbed()
    }
  }, 250)
  embedDeadline = setTimeout(failEmbed, 10000)
}

const tiktokStatus = ref<{ configured: boolean; connected: boolean }>({ configured: false, connected: false })
const videos = ref<any[]>([])
const videosLoading = ref(false)
const videosError = ref('')


onMounted(() => {
  loadEmbedScript()
  // If embed.js was already on the page (client-side navigation from an
  // earlier visit), kick it again so our freshly mounted blockquote is
  // processed too — then let watchEmbed decide success or failure.
  if (embedRoot.value && window.tiktokEmbedLoaded) {
    window.tiktokEmbedLoaded()
  }
  watchEmbed()
})

onUnmounted(stopWatchingEmbed)

/**
 * The SSR self-call carries neither Origin nor Referer, and /api/tiktok/
 * {products,videos} reject exactly that (requireSameOriginRead) so plain curl
 * stays blocked. Declaring our own origin keeps us allowed and everyone else
 * out. The same literal is already hardcoded for ogUrl across these pages.
 */
const SSR_HEADERS = { origin: 'https://kpop-tracker-six.vercel.app' }

// Products, videos and connection status ship with the server-rendered HTML
// instead of popping in after mount. No handler throws: a dead or rate-limited
// TikTok API must leave these sections empty, not abort the render.
//
// All three declared before awaiting — useAsyncData starts its fetch during the
// call, so awaiting one at a time would serialise round trips that can overlap.
const statusAsync = useAsyncData('shop:status', () =>
  $fetch<any>('/api/tiktok/status').catch(() => null),
)
const videosAsync = useAsyncData('shop:videos', () =>
  $fetch<any>('/api/tiktok/videos', { headers: SSR_HEADERS }).catch(() => null),
)
await Promise.all([statusAsync, videosAsync])

// Refs rather than computeds, and assigned here rather than derived: the refresh
// button calls loadVideos(true) / loadProducts() later and must be able to
// overwrite them.
tiktokStatus.value = {
  configured: Boolean(statusAsync.data.value?.configured),
  connected: Boolean(statusAsync.data.value?.connected),
}
videos.value = videosAsync.data.value?.videos || []
videosError.value = ''

// loadStatus is gone: connection status arrives with the SSR payload above and
// there is no button that re-checks it, so a manual reload was its only refresh.

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
    return
  }
  const script = document.createElement('script')
  script.src = 'https://www.tiktok.com/embed.js'
  script.async = true
  script.onload = () => {
    if (typeof window.tiktokEmbedLoaded === 'function') {
      window.tiktokEmbedLoaded()
    }
  }
  // Ad-blockers reject the tag outright; without this the page used to sit
  // on an empty box forever. Timeout in watchEmbed() covers the rest.
  script.onerror = failEmbed
  document.body.appendChild(script)
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader back active="shop" />

    <main>
      <!-- Hero -->
      <section class="border-b border-border">
        <div class="page-shell py-10 sm:py-14">
          <div class="flex flex-col items-center gap-6 text-center sm:gap-8">
            <!-- Logo -->
            <img
              src="/hibikishop-logo.png"
              alt="HIBIKISHOP"
              class="h-28 w-28 drop-shadow-md sm:h-36 sm:w-36"
            />

            <!-- Eyebrow + title -->
            <div>
              <p class="eyebrow">{{ t('shop.eyebrow') }}</p>
              <h1 class="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {{ t('shop.title') }}
              </h1>
              <p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                {{ t('shop.tagline') }}
              </p>
            </div>

            <!-- Marketplace buttons -->
            <div class="flex flex-wrap justify-center gap-3">
              <Button
                size="lg"
                class="h-12 gap-2.5 rounded-xl bg-[#EE4D2D] px-6 text-white hover:bg-[#d94429] dark:bg-[#EE4D2D] dark:hover:bg-[#d94429]"
                as-child
              >
                <a :href="SHOP_URLS.shopee" target="_blank" rel="noopener noreferrer">
                  <img src="/social/shopee.svg" alt="" class="h-5 w-5 brightness-0 invert" aria-hidden="true" />
                  {{ t('shop.heroShopee') }}
                </a>
              </Button>
              <Button
                size="lg"
                class="h-12 gap-2.5 rounded-xl bg-[#42B549] px-6 text-white hover:bg-[#379e3f] dark:bg-[#42B549] dark:hover:bg-[#379e3f]"
                as-child
              >
                <a :href="SHOP_URLS.tokopedia" target="_blank" rel="noopener noreferrer">
                  <img src="/social/tokopedia.png" alt="" class="h-5 w-5 brightness-0 invert" aria-hidden="true" />
                  {{ t('shop.heroTokopedia') }}
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                class="h-12 gap-2.5 rounded-xl px-6"
                as-child
              >
                <a :href="SHOP_URLS.tiktok" target="_blank" rel="noopener noreferrer">
                  <img src="/social/tiktok.svg" alt="" class="h-5 w-5" aria-hidden="true" />
                  {{ t('shop.heroTiktok') }}
                </a>
              </Button>
            </div>
          </div>

          <p
            v-if="connectedNotice"
            class="mt-6 rounded-lg border px-3 py-2 text-sm text-center"
            :class="route.query.tiktok_error
              ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200'"
          >
            {{ connectedNotice }}
          </p>
        </div>
      </section>

      <!-- How to Order (C) -->
      <section class="border-t border-border">
        <div class="page-shell py-10 sm:py-12">
          <div class="mb-8 text-center">
            <p class="eyebrow">{{ t('shop.howEyebrow') }}</p>
            <h2 class="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {{ t('shop.howTitle') }}
            </h2>
          </div>

          <div class="grid gap-6 sm:grid-cols-3">
            <!-- Step 1 -->
            <div class="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ShoppingBag class="h-5 w-5 text-foreground" />
              </div>
              <div class="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">1</div>
              <h3 class="font-semibold text-foreground">{{ t('shop.howStep1Title') }}</h3>
              <p class="text-sm leading-relaxed text-muted-foreground">{{ t('shop.howStep1Desc') }}</p>
            </div>

            <!-- Step 2 -->
            <div class="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <MessageCircle class="h-5 w-5 text-foreground" />
              </div>
              <div class="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">2</div>
              <h3 class="font-semibold text-foreground">{{ t('shop.howStep2Title') }}</h3>
              <p class="text-sm leading-relaxed text-muted-foreground">{{ t('shop.howStep2Desc') }}</p>
            </div>

            <!-- Step 3 -->
            <div class="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Truck class="h-5 w-5 text-foreground" />
              </div>
              <div class="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">3</div>
              <h3 class="font-semibold text-foreground">{{ t('shop.howStep3Title') }}</h3>
              <p class="text-sm leading-relaxed text-muted-foreground">{{ t('shop.howStep3Desc') }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Order / Contact (D) -->
      <section class="border-t border-border bg-muted dark:bg-muted/40">
        <div class="page-shell py-10 sm:py-12">
          <div class="flex flex-col items-center gap-4 text-center">
            <p class="eyebrow">{{ t('shop.orderEyebrow') }}</p>
            <h2 class="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {{ t('shop.orderTitle') }}
            </h2>
            <p class="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {{ t('shop.orderDesc') }}
            </p>
            <div class="mt-2 flex flex-wrap justify-center gap-3">
              <Button
                size="lg"
                class="h-12 gap-2.5 rounded-xl px-6"
                as-child
              >
                <a :href="SHOP_URLS.tiktok" target="_blank" rel="noopener noreferrer">
                  <img src="/social/tiktok.svg" alt="" class="h-5 w-5 brightness-0 invert dark:brightness-100 dark:invert-0" aria-hidden="true" />
                  {{ t('shop.orderDmTiktok') }}
                </a>
              </Button>
              <Button
                size="lg"
                class="h-12 gap-2.5 rounded-xl bg-[#EE4D2D] px-6 text-white hover:bg-[#d94429] dark:bg-[#EE4D2D] dark:hover:bg-[#d94429]"
                as-child
              >
                <a :href="SHOP_URLS.shopee" target="_blank" rel="noopener noreferrer">
                  <img src="/social/shopee.svg" alt="" class="h-5 w-5 brightness-0 invert" aria-hidden="true" />
                  {{ t('shop.orderChatShopee') }}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <!-- Featured collections (manual fallback) -->
      <section class="border-t border-border">
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
                  class="shrink-0 rounded-md border border-border bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground dark:border-border-strong dark:bg-card/90"
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
      <section class="border-t border-border">
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
            class="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"
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
            class="rounded-xl border border-dashed border-border px-6 py-10 text-center"
          >
            <Video class="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
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
              class="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div class="relative aspect-[9/14] bg-muted">
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
          <div class="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <p class="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {{ t('shop.liveEmbed') }}
            </p>
            <ClientOnly>
              <!-- While loading (or once ready) the blockquote must stay in
                   the DOM: that is what embed.js processes into the iframe. -->
              <div v-if="embedState !== 'failed'" ref="embedRoot" class="tiktok-embed-root min-h-[280px]">
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
              <!-- Blocked/failed embed: an honest card with a working link
                   instead of a 280px box containing one 24px link. -->
              <div
                v-else
                class="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border p-6 text-center"
              >
                <img src="/social/tiktok.svg" alt="" class="h-8 w-8" aria-hidden="true" />
                <p class="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {{ t('shop.liveEmbedBlocked') }}
                </p>
                <Button variant="outline" class="h-10 rounded-lg" as-child>
                  <a :href="SHOP_URLS.tiktok" target="_blank" rel="noopener noreferrer">
                    <ExternalLink class="h-4 w-4" aria-hidden="true" />
                    {{ t('shop.openTikTok') }}
                  </a>
                </Button>
              </div>
              <template #fallback>
                <div class="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
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
