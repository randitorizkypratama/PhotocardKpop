<script setup lang="ts">
import { ExternalLink, Play } from 'lucide-vue-next'
import { SHOP_URLS, shopProducts } from '@/lib/shop'

declare global {
  interface Window {
    tiktokEmbedLoaded?: () => void
  }
}

useHead({ title: 'Shop — HIBIKISHOP PC' })

const embedRoot = ref<HTMLElement | null>(null)
const embedReady = ref(false)

onMounted(() => {
  loadEmbedScript()
  if (embedRoot.value && window.tiktokEmbedLoaded) {
    window.tiktokEmbedLoaded()
    embedReady.value = true
  }
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
          <p class="eyebrow">HIBIKISHOP Store</p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Etalase &amp; TikTok
          </h1>
          <p class="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Belanja photocard HIBIKISHOP lewat Shopee, Tokopedia, atau TikTok — plus video terbaru dari kami.
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
        </div>
      </section>

      <!-- Etalase -->
      <section class="page-shell py-10 sm:py-12">
        <div class="mb-5 sm:mb-6">
          <p class="eyebrow">Etalase</p>
          <h2 class="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            Featured collections
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
                <h3 class="text-base font-semibold text-foreground sm:text-lg">{{ product.name }}</h3>
              </div>
              <span
                v-if="product.badge"
                class="shrink-0 rounded-md border border-zinc-200 bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200"
              >
                {{ product.badge }}
              </span>
            </div>

            <p class="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              {{ product.description }}
            </p>

            <Button class="mt-4 h-10 w-full gap-2 rounded-lg" as-child>
              <a :href="product.href" target="_blank" rel="noopener noreferrer">
                {{ product.cta }}
                <ExternalLink class="h-4 w-4" />
              </a>
            </Button>
          </article>
        </div>
      </section>

      <!-- TikTok embed -->
      <section class="border-t border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-10 sm:py-12">
          <div class="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
            <div>
              <p class="eyebrow">TikTok</p>
              <h2 class="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                Latest from @hibikis13
              </h2>
            </div>
            <a
              :href="SHOP_URLS.tiktok"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Open TikTok
              <ExternalLink class="h-4 w-4" />
            </a>
          </div>

          <div class="rounded-xl border border-zinc-200 bg-card p-4 shadow-sm dark:border-zinc-800 sm:p-6">
            <div class="mb-4 flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <Play class="h-4 w-4 text-foreground" aria-hidden="true" />
              </div>
              <div class="min-w-0 leading-tight">
                <p class="truncate text-sm font-semibold text-foreground">Hibikishop</p>
                <a
                  :href="SHOP_URLS.tiktok"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs text-muted-foreground hover:text-foreground"
                >
                  @hibikis13
                </a>
              </div>
            </div>

            <!-- Official TikTok creator profile embed (shows recent videos) -->
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
                  Loading TikTok…
                </div>
              </template>
            </ClientOnly>

            <p class="mt-4 text-xs text-muted-foreground">
              Video di-embed resmi dari TikTok. Kalau tidak muncul,
              <a :href="SHOP_URLS.tiktok" target="_blank" rel="noopener noreferrer" class="font-medium text-foreground underline-offset-2 hover:underline">
                buka profil @hibikis13
              </a>.
            </p>
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
