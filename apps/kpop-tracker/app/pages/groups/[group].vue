<script setup lang="ts">
import { ArrowRight, AlertCircle } from 'lucide-vue-next'
import { groupDot } from '@/lib/catalog'
import { cardTypeLabel } from '@/lib/cardTypes'

const route = useRoute()
const group = String(route.params.group || '')

const info = ref<any>(null)
const loading = ref(true)
const loadError = ref(false)
const exchangeRates = ref<any>(null)
const { fetchCollection, wishlistIds, toggleWishlist } = useCollection()

useHead({ title: computed(() => (info.value ? `${info.value.group} photocards — HIBIKISHOP PC` : 'Group — HIBIKISHOP PC')) })

onMounted(() => {
  load()
  fetchCollection()
})

async function load() {
  loading.value = true
  loadError.value = false
  try {
    const [summary, rates] = await Promise.all([
      $fetch<any>(`/api/groups/${encodeURIComponent(group)}`),
      $fetch<any>('/api/exchangerate').catch(() => ({ success: false, data: null })),
    ])
    if (summary.success) info.value = summary.data
    else loadError.value = true
    if (rates.success) exchangeRates.value = rates.data
  } catch (e) {
    console.error('Failed to load group:', e)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

const rate = computed(() => exchangeRates.value?.usd?.rate || 17800)

const typeRows = computed(() => {
  const rows = info.value?.byType || []
  const max = Math.max(1, ...rows.map((r: any) => Number(r.count) || 0))
  return rows.map((r: any) => ({
    type: r.card_type,
    label: cardTypeLabel(r.card_type),
    count: Number(r.count) || 0,
    pct: Math.round(((Number(r.count) || 0) / max) * 100),
  }))
})

async function onWishlist(id: number | string) {
  await toggleWishlist(Number(id))
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader back />

    <main>
      <!-- Group header -->
      <section class="border-b border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-8 sm:py-10">
          <p class="eyebrow">Group · Photocard catalog</p>
          <div class="mt-2 flex items-center gap-2.5">
            <span class="h-2.5 w-2.5 rounded-full" :class="groupDot(group)" aria-hidden="true" />
            <h1 class="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{{ group }}</h1>
          </div>

          <div v-if="loading" class="mt-4 space-y-2">
            <div class="skeleton-block h-3 w-48" />
          </div>
          <div v-else-if="info" class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            <span><span class="font-medium tabular-nums text-foreground">{{ info.total.toLocaleString() }}</span> cards</span>
            <span><span class="font-medium tabular-nums text-foreground">{{ info.members }}</span> members</span>
            <span><span class="font-medium tabular-nums text-foreground">{{ info.releaseCount }}</span> releases</span>
            <span class="text-xs">Market reference · Pocamarket</span>
          </div>
        </div>
      </section>

      <!-- Error -->
      <div v-if="loadError && !loading" class="page-shell py-8">
        <div class="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/40" role="alert">
          <div class="flex items-start gap-2.5">
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p class="text-sm font-medium text-red-900 dark:text-red-200">Unable to load this group.</p>
          </div>
          <Button variant="outline" size="sm" class="rounded-lg" @click="load">Retry</Button>
        </div>
      </div>

      <div v-else-if="info" class="page-shell py-8 sm:py-10">
        <div class="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
          <!-- Sidebar: members + card types -->
          <aside class="space-y-6">
            <div>
              <p class="pc-meta-label mb-2.5">Members</p>
              <div class="flex flex-wrap gap-1.5">
                <NuxtLink
                  v-for="m in info.byMember"
                  :key="m.member_name"
                  class="chip"
                  :to="{ path: '/browse', query: { group, member: m.member_name } }"
                >
                  <span class="truncate">{{ m.member_name }}</span>
                  <span class="tabular-nums text-muted-foreground">{{ m.count.toLocaleString() }}</span>
                </NuxtLink>
              </div>
            </div>

            <div>
              <p class="pc-meta-label mb-2.5">Card types</p>
              <div class="overflow-hidden rounded-xl border border-border bg-card">
                <NuxtLink
                  v-for="(row, i) in typeRows"
                  :key="row.type"
                  class="relative flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted"
                  :class="i > 0 ? 'border-t border-border' : ''"
                  :to="{ path: '/browse', query: { group, card_type: row.type } }"
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
              <p class="mt-2 text-[11px] text-muted-foreground">Counts from the full catalog.</p>
            </div>
          </aside>

          <!-- Content -->
          <div class="min-w-0 space-y-10">
            <!-- Latest -->
            <section>
              <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p class="eyebrow">Latest</p>
                  <h2 class="mt-1 section-title">Newest {{ group }} cards</h2>
                </div>
                <NuxtLink
                  :to="{ path: '/browse', query: { group } }"
                  class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Open catalog
                  <ArrowRight class="h-4 w-4" />
                </NuxtLink>
              </div>

              <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                <div v-for="i in 8" :key="i" class="pc-skeleton">
                  <div class="skeleton-block aspect-square rounded-none" />
                  <div class="space-y-2.5 p-3">
                    <div class="skeleton-block h-3 w-1/3" />
                    <div class="skeleton-block h-3.5 w-full" />
                    <div class="skeleton-block h-4 w-1/2" />
                  </div>
                </div>
              </div>

              <div v-else-if="info.latest.length === 0" class="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
                <p class="text-sm text-muted-foreground">No cards indexed for this group yet.</p>
              </div>

              <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                <PhotocardCard
                  v-for="card in info.latest"
                  :key="card.id"
                  :card="card"
                  :rate="rate"
                  show-wishlist
                  :wishlisted="wishlistIds.has(card.id)"
                  @wishlist="onWishlist"
                />
              </div>
            </section>

            <!-- Releases -->
            <section v-if="info.releases.length > 0">
              <p class="eyebrow">Albums / releases</p>
              <h2 class="mt-1 mb-4 section-title">Where these cards come from</h2>

              <div class="grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800">
                <NuxtLink
                  v-for="release in info.releases"
                  :key="release.release_name"
                  class="flex items-center justify-between gap-3 bg-card px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  :to="{ path: '/browse', query: { group, release: release.release_name } }"
                >
                  <span class="min-w-0 truncate text-sm text-foreground">{{ release.release_name }}</span>
                  <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ release.count.toLocaleString() }}</span>
                </NuxtLink>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
