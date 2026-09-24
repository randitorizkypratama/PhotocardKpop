<script setup lang="ts">
import { ArrowRight, Search } from 'lucide-vue-next'
import { GROUPS, groupAccentActive, groupDot } from '@/lib/catalog'

useHead({ title: 'HIBIKISHOP PC — K-Pop Photocard Catalog' })

const selectedGroup = ref<string>('IVE')
const searchQuery = ref('')
const cards = ref<any[]>([])
const loading = ref(true)
const exchangeRates = ref<any>(null)
const { fetchCollection, wishlistIds, toggleWishlist } = useCollection()

const groupTabs = GROUPS

const exploreGroups = [
  {
    name: 'IVE',
    description: 'Album pulls, POBs, and fan-signed cards.',
    accent: 'border-ive/25 bg-ive/5 hover:border-ive/40',
    dot: 'bg-ive',
    text: 'text-ive',
  },
  {
    name: 'aespa',
    description: 'Tour merch, lucky draws, and essentials.',
    accent: 'border-aespa/25 bg-aespa/5 hover:border-aespa/40',
    dot: 'bg-aespa',
    text: 'text-aespa',
  },
  {
    name: 'Hearts2Hearts',
    description: 'Fresh releases tracked from Pocamarket.',
    accent: 'border-h2h/25 bg-h2h/5 hover:border-h2h/40',
    dot: 'bg-h2h',
    text: 'text-h2h',
  },
]

onMounted(() => {
  loadCards()
  loadExchangeRates()
  fetchCollection()
})

watch(selectedGroup, () => loadCards())

async function loadExchangeRates() {
  try {
    const response = await $fetch<any>('/api/exchangerate')
    if (response.success) exchangeRates.value = response.data
  } catch (e) {
    console.error('Failed to load exchange rates:', e)
  }
}

const rate = computed(() => exchangeRates.value?.usd?.rate || 17800)

async function loadCards() {
  loading.value = true
  try {
    const response = await $fetch<any>(
      `/api/cards?group=${encodeURIComponent(selectedGroup.value)}&page=1&limit=10&sort=popular`,
    )
    if (response.success) cards.value = response.data
  } catch (e) {
    console.error('Failed to load cards:', e)
    cards.value = []
  } finally {
    loading.value = false
  }
}

function submitSearch() {
  const q = searchQuery.value.trim()
  navigateTo({ path: '/browse', query: q ? { q } : {} })
}

async function onWishlist(id: number | string) {
  await toggleWishlist(Number(id))
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader active="home" />

    <main>
      <!-- Hero -->
      <section class="border-b border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-10 sm:py-14 lg:py-16">
          <div class="mx-auto max-w-2xl text-center">
            <p class="eyebrow">K-Pop Photocard Catalog</p>
            <h1 class="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              Browse photocards from your favorite groups.
            </h1>
            <p class="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
              Track prices from
              <a href="https://pocamarket.com" target="_blank" rel="noopener noreferrer" class="font-medium text-foreground underline-offset-2 hover:underline">Pocamarket</a>
              for IVE, aespa, and Hearts2Hearts.
            </p>

            <form class="mx-auto mt-6 max-w-md" role="search" @submit.prevent="submitSearch">
              <label for="hero-search" class="sr-only">Search member, album, photocard</label>
              <div class="relative">
                <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="hero-search"
                  v-model="searchQuery"
                  type="search"
                  placeholder="Search member, album, photocard..."
                  class="h-11 w-full rounded-xl border border-zinc-200 bg-card pl-10 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
                />
              </div>
            </form>

            <div class="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                v-for="group in groupTabs"
                :key="group"
                type="button"
                class="rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="
                  selectedGroup === group
                    ? groupAccentActive(group)
                    : 'border-zinc-200 bg-card text-muted-foreground hover:border-zinc-300 hover:text-foreground dark:border-zinc-800 dark:hover:border-zinc-700'
                "
                :aria-pressed="selectedGroup === group"
                @click="selectedGroup = group"
              >
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-1.5 w-1.5 rounded-full" :class="groupDot(group)" />
                  {{ group }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Trending -->
      <section class="page-shell py-10 sm:py-12">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
          <div>
            <p class="eyebrow">{{ selectedGroup }}</p>
            <h2 class="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">Trending Photocards</h2>
          </div>
          <NuxtLink
            to="/browse"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
            <ArrowRight class="h-4 w-4" />
          </NuxtLink>
        </div>

        <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          <div v-for="i in 10" :key="i" class="pc-skeleton">
            <div class="skeleton-block aspect-square rounded-none" />
            <div class="space-y-2.5 p-3">
              <div class="skeleton-block h-3 w-1/3" />
              <div class="skeleton-block h-3.5 w-full" />
              <div class="skeleton-block h-3.5 w-2/3" />
              <div class="skeleton-block h-4 w-1/2" />
            </div>
          </div>
        </div>

        <div v-else-if="cards.length === 0" class="rounded-xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
          <p class="text-sm font-medium text-foreground">No photocards found.</p>
          <p class="mt-1 text-sm text-muted-foreground">Try another group or check back after the daily sync.</p>
          <Button variant="outline" class="mt-4 rounded-lg" as-child>
            <NuxtLink to="/browse">Browse all photocards</NuxtLink>
          </Button>
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
      </section>

      <!-- Explore Groups -->
      <section id="groups" class="scroll-mt-20 border-t border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-10 sm:py-12">
          <div class="mb-5 sm:mb-6">
            <p class="eyebrow">Catalog</p>
            <h2 class="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">Explore Groups</h2>
          </div>

          <div class="grid gap-3 sm:gap-4 md:grid-cols-3">
            <NuxtLink
              v-for="group in exploreGroups"
              :key="group.name"
              :to="`/browse?group=${encodeURIComponent(group.name)}`"
              class="group rounded-xl border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-6"
              :class="group.accent"
            >
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full" :class="group.dot" />
                <h3 class="text-base font-semibold text-foreground sm:text-lg">{{ group.name }}</h3>
              </div>
              <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ group.description }}</p>
              <span class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium" :class="group.text">
                Browse {{ group.name }}
                <ArrowRight class="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </span>
            </NuxtLink>
          </div>
        </div>
      </section>
    </main>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
