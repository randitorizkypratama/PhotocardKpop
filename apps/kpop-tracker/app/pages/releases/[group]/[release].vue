<script setup lang="ts">
import { ArrowRight, AlertCircle } from 'lucide-vue-next'
import { formatIDR, formatUSD, groupDot } from '@/lib/catalog'
import { cardTypeLabel } from '@/lib/cardTypes'

const route = useRoute()
const group = String(route.params.group || '')
const slug = String(route.params.release || '')

const detail = ref<any>(null)
const loading = ref(true)
const loadError = ref(false)
const notFound = ref(false)

const cards = ref<any[]>([])
const page = ref(1)
const totalPages = ref(1)
const cardsLoading = ref(false)

const exchangeRates = ref<any>(null)
const { fetchCollection, wishlistIds, toggleWishlist } = useCollection()

useHead({
  title: computed(() =>
    detail.value
      ? `${detail.value.release_name} — ${detail.value.group_name} photocards`
      : 'Release — HIBIKISHOP PC',
  ),
})

onMounted(() => {
  fetchCollection()
  load()
})

async function load() {
  loading.value = true
  loadError.value = false
  notFound.value = false
  try {
    const [release, rates] = await Promise.all([
      $fetch<any>('/api/releases/detail', { query: { group, slug } }),
      $fetch<any>('/api/exchangerate').catch(() => ({ success: false, data: null })),
    ])
    if (!release?.success || !release.data) {
      notFound.value = true
      return
    }
    detail.value = release.data
    if (rates?.success) exchangeRates.value = rates.data
    await loadCards(1)
  } catch (e: any) {
    if (e?.statusCode === 404) notFound.value = true
    else {
      console.error('Failed to load release:', e)
      loadError.value = true
    }
  } finally {
    loading.value = false
  }
}

async function loadCards(nextPage: number) {
  cardsLoading.value = true
  try {
    const response = await $fetch<any>('/api/cards', {
      query: {
        group,
        release: detail.value.release_name,
        page: nextPage,
        limit: 24,
        sort: 'popular',
      },
    })
    if (response?.success) {
      cards.value = nextPage === 1 ? response.data : [...cards.value, ...response.data]
      page.value = nextPage
      totalPages.value = response.pagination?.totalPages || 1
    }
  } catch (e) {
    console.error('Failed to load cards:', e)
  } finally {
    cardsLoading.value = false
  }
}

const rate = computed(() => exchangeRates.value?.usd?.rate || 17800)

const typeRows = computed(() => {
  const rows = detail.value?.byType || []
  const max = Math.max(1, ...rows.map((row: any) => Number(row.count) || 0))
  return rows.map((row: any) => ({
    type: row.card_type,
    label: cardTypeLabel(row.card_type) || row.card_type || 'Uncategorized',
    count: Number(row.count) || 0,
    pct: Math.round(((Number(row.count) || 0) / max) * 100),
  }))
})

const sourceLabels = computed(() =>
  (detail.value?.sources || []).map((source: string) => {
    if (source === 'musicbrainz') return 'MusicBrainz'
    if (source === 'apple') return 'Apple Music'
    return source
  }),
)

function formatDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

async function onWishlist(id: number | string) {
  await toggleWishlist(Number(id))
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader back />

    <main>
      <!-- Loading -->
      <div v-if="loading" class="page-shell py-8 sm:py-10">
        <div class="flex flex-col gap-6 sm:flex-row">
          <div class="skeleton-block aspect-square w-full max-w-[220px] shrink-0 rounded-xl" />
          <div class="min-w-0 flex-1 space-y-3">
            <div class="skeleton-block h-3 w-32" />
            <div class="skeleton-block h-7 w-2/3" />
            <div class="skeleton-block h-3.5 w-1/2" />
            <div class="skeleton-block h-3.5 w-1/3" />
          </div>
        </div>
      </div>

      <!-- Not found -->
      <div v-else-if="notFound" class="page-shell py-12">
        <div class="rounded-xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
          <p class="text-sm font-medium text-foreground">Release not found.</p>
          <p class="mt-1 text-sm text-muted-foreground">It may have been renamed by the latest sync.</p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" class="rounded-lg" as-child>
              <NuxtLink to="/releases">All releases</NuxtLink>
            </Button>
            <Button class="rounded-lg" as-child>
              <NuxtLink to="/browse">Browse catalog</NuxtLink>
            </Button>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="loadError" class="page-shell py-8">
        <div class="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/40" role="alert">
          <div class="flex items-start gap-2.5">
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p class="text-sm font-medium text-red-900 dark:text-red-200">Unable to load this release.</p>
          </div>
          <Button variant="outline" size="sm" class="rounded-lg" @click="load">Retry</Button>
        </div>
      </div>

      <template v-else-if="detail">
        <!-- Release header -->
        <section class="border-b border-zinc-200 dark:border-zinc-800">
          <div class="page-shell py-8 sm:py-10">
            <p class="eyebrow">Release · Photocards</p>

            <div class="mt-3 flex flex-col gap-5 sm:flex-row sm:gap-6">
              <div class="w-full max-w-[220px] shrink-0 self-start">
                <span class="block aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                  <img
                    v-if="detail.artwork"
                    :src="detail.artwork"
                    :alt="`${detail.release_name} artwork`"
                    decoding="async"
                    class="h-full w-full object-cover"
                  />
                </span>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full" :class="groupDot(detail.group_name)" aria-hidden="true" />
                  <NuxtLink
                    :to="`/groups/${encodeURIComponent(detail.group_name)}`"
                    class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {{ detail.group_name }}
                  </NuxtLink>
                </div>

                <h1 class="mt-1.5 break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {{ detail.release_name }}
                </h1>

                <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                  <span v-if="detail.release_date">
                    <span class="font-medium tabular-nums text-foreground">{{ formatDate(detail.release_date) }}</span>
                  </span>
                  <span v-if="detail.release_type">{{ detail.release_type }}</span>
                  <span v-if="detail.count > 0">
                    <span class="font-medium tabular-nums text-foreground">{{ detail.count.toLocaleString() }}</span>
                    cards
                  </span>
                  <span v-else>No cards yet</span>
                  <span v-if="detail.members > 0">
                    <span class="font-medium tabular-nums text-foreground">{{ detail.members }}</span>
                    members
                  </span>
                  <span v-if="detail.label" class="truncate">{{ detail.label }}</span>
                </div>

                <div v-if="detail.cheapest" class="mt-4">
                  <p class="pc-meta-label">Cheapest card</p>
                  <div class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span class="text-sm font-medium tabular-nums text-foreground">
                      Rp {{ formatIDR(detail.cheapest, rate) }}
                    </span>
                    <span class="text-xs tabular-nums text-muted-foreground">{{ formatUSD(detail.cheapest) }}</span>
                    <span class="text-xs text-muted-foreground">market reference</span>
                  </div>
                </div>

                <div class="mt-4 flex flex-wrap items-center gap-2">
                  <Button v-if="detail.count > 0" class="h-9 gap-1.5 rounded-lg" as-child>
                    <NuxtLink :to="{ path: '/browse', query: { group: detail.group_name, release: detail.release_name } }">
                      See in catalog
                      <ArrowRight class="h-4 w-4" />
                    </NuxtLink>
                  </Button>
                  <span
                    v-for="label in sourceLabels"
                    :key="label"
                    class="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {{ label }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Facts -->
        <section class="border-b border-zinc-200 dark:border-zinc-800">
          <div class="page-shell grid gap-6 py-7 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
            <div v-if="typeRows.length > 0">
              <p class="pc-meta-label mb-2.5">Card types</p>
              <div class="overflow-hidden rounded-xl border border-border bg-card">
                <NuxtLink
                  v-for="(row, i) in typeRows"
                  :key="row.type || 'none'"
                  class="relative flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted"
                  :class="i > 0 ? 'border-t border-border' : ''"
                  :to="{ path: '/browse', query: { group: detail.group_name, release: detail.release_name, card_type: row.type } }"
                >
                  <span
                    class="pointer-events-none absolute inset-y-0 left-0 bg-muted/70"
                    :style="{ width: `${row.pct}%` }"
                    aria-hidden="true"
                  />
                  <span class="relative min-w-0 truncate text-sm text-foreground">{{ row.label }}</span>
                  <span class="relative shrink-0 text-xs tabular-nums text-muted-foreground">{{ row.count.toLocaleString() }}</span>
                </NuxtLink>
              </div>
            </div>

            <div v-if="detail.byMember.length > 0">
              <p class="pc-meta-label mb-2.5">Members</p>
              <div class="flex flex-wrap gap-1.5">
                <NuxtLink
                  v-for="member in detail.byMember"
                  :key="member.member_name"
                  class="chip"
                  :to="{ path: '/browse', query: { group: detail.group_name, release: detail.release_name, member: member.member_name } }"
                >
                  <span class="truncate">{{ member.member_name }}</span>
                  <span class="tabular-nums text-muted-foreground">{{ member.count.toLocaleString() }}</span>
                </NuxtLink>
              </div>
            </div>

            <div v-if="detail.tracks.length > 0">
              <p class="pc-meta-label mb-2.5">Tracklist</p>
              <ol class="overflow-hidden rounded-xl border border-border bg-card">
                <li
                  v-for="track in detail.tracks"
                  :key="`${track.position}-${track.title}`"
                  class="flex items-baseline gap-3 px-3.5 py-2 text-sm"
                  :class="track.position > 1 ? 'border-t border-border' : ''"
                >
                  <span class="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{{ track.position }}</span>
                  <span class="min-w-0 truncate text-foreground">{{ track.title }}</span>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <!-- Cards -->
        <section class="page-shell py-8 sm:py-10">
          <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="eyebrow">Photocards</p>
              <h2 class="mt-1.5 section-title">
                <template v-if="detail.count > 0">
                  {{ detail.count.toLocaleString() }} card{{ detail.count === 1 ? '' : 's' }}
                </template>
                <template v-else>No photocards yet</template>
              </h2>
            </div>
            <NuxtLink
              v-if="detail.count > 0"
              :to="{ path: '/browse', query: { group: detail.group_name, release: detail.release_name } }"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Open catalog
              <ArrowRight class="h-4 w-4" />
            </NuxtLink>
          </div>

          <div v-if="cardsLoading && cards.length === 0" class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            <div v-for="i in 10" :key="i" class="pc-skeleton">
              <div class="skeleton-block aspect-square rounded-none" />
              <div class="space-y-2.5 p-3">
                <div class="skeleton-block h-3 w-1/3" />
                <div class="skeleton-block h-3.5 w-full" />
                <div class="skeleton-block h-3.5 w-2/3" />
              </div>
            </div>
          </div>

          <div v-else-if="cards.length === 0" class="rounded-xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
            <p class="text-sm font-medium text-foreground">No photocards listed.</p>
            <p class="mt-1 text-sm text-muted-foreground">Check back after the daily Pocamarket sync.</p>
          </div>

          <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            <PhotocardCard
              v-for="card in cards"
              :key="card.id"
              :card="card"
              :rate="rate"
              show-wishlist
              :wishlisted="wishlistIds.has(card.id)"
              @wishlist="onWishlist"
            />
          </div>

          <div v-if="page < totalPages" class="mt-8 flex justify-center">
            <Button variant="outline" class="rounded-lg" :disabled="cardsLoading" @click="loadCards(page + 1)">
              {{ cardsLoading ? 'Loading…' : 'Load more' }}
            </Button>
          </div>
        </section>
      </template>
    </main>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
