<script setup lang="ts">
import {
  ArrowRight, Package, DollarSign,
  TrendingUp, Users, Search
} from 'lucide-vue-next'

const groups = ['IVE', 'aespa', 'Hearts2Hearts']
const selectedGroup = ref('IVE')

const cards = ref<any[]>([])
const loading = ref(true)
const exchangeRates = ref<any>(null)

onMounted(() => {
  loadCards()
  loadExchangeRates()
})

watch(selectedGroup, () => { loadCards() })

async function loadExchangeRates() {
  try {
    const response = await $fetch<any>('/api/exchangerate')
    if (response.success) exchangeRates.value = response.data
  } catch (e) {
    console.error('Failed to load exchange rates:', e)
  }
}

function formatIDR(usd: number): string {
  const rate = exchangeRates.value?.usd?.rate || 17800
  return Math.round((Number(usd) || 0) * rate).toLocaleString('id-ID')
}

async function loadCards() {
  loading.value = true
  try {
    const response = await $fetch<any>(`/api/cards?group=${selectedGroup.value}&page=1&limit=10`)
    if (response.success) cards.value = response.data
  } catch (e) {
    console.error('Failed to load cards:', e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 dark:from-slate-950 dark:via-purple-950 dark:to-slate-950">
    <!-- Hero Section -->
    <section class="relative overflow-hidden px-4 pb-12 pt-8 sm:pb-16 sm:pt-12">
      <div class="absolute left-10 top-10 h-72 w-72 rounded-full bg-purple-300/30 blur-3xl dark:bg-purple-500/20" />
      <div class="absolute bottom-10 right-10 h-72 w-72 rounded-full bg-pink-300/30 blur-3xl dark:bg-pink-500/20" />

      <div class="relative mx-auto max-w-4xl text-center">
        <div class="mb-4 flex items-center justify-between gap-3 sm:mb-6 sm:block">
          <NuxtLink to="/" class="inline-flex items-center gap-2.5 rounded-full bg-white/80 px-3 py-1.5 shadow-lg backdrop-blur sm:px-4 sm:py-2 dark:bg-black/50">
            <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-9 w-9 rounded-full object-contain sm:h-10 sm:w-10" />
            <div class="text-left leading-tight">
              <span class="block text-sm font-bold text-slate-800 dark:text-slate-100">HIBIKISHOP</span>
              <span class="block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Photocard Tracker</span>
            </div>
          </NuxtLink>
          <div class="sm:absolute sm:right-4 sm:top-4">
            <DarkModeToggle />
          </div>
        </div>

        <h1 class="mb-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl">
          Track Your
          <span class="gradient-text">Photocards</span>
          Collection
        </h1>

        <p class="mb-6 text-base text-slate-500 dark:text-slate-400 sm:mb-8 sm:text-lg">
          Real-time prices from
          <a href="https://pocamarket.com" target="_blank" rel="noopener noreferrer" class="font-semibold text-purple-600 underline decoration-purple-300 underline-offset-2 transition-colors hover:text-purple-700 hover:decoration-purple-500 dark:text-purple-400 dark:decoration-purple-700 dark:hover:text-purple-300">Pocamarket</a>.
          IVE, aespa, Hearts2Hearts.
        </p>

        <div class="mb-6 flex flex-wrap items-center justify-center gap-3 sm:gap-6 sm:mb-8">
          <div class="glass-card flex items-center gap-2.5 rounded-2xl px-4 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
            <Users class="h-5 w-5 text-purple-500" />
            <span class="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">3</span>
            <span class="text-sm text-slate-500 dark:text-slate-400">Groups</span>
          </div>
          <div class="glass-card flex items-center gap-2.5 rounded-2xl px-4 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
            <Package class="h-5 w-5 text-pink-500" />
            <span class="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">16K+</span>
            <span class="text-sm text-slate-500 dark:text-slate-400">Cards</span>
          </div>
          <div class="glass-card flex items-center gap-2.5 rounded-2xl px-4 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
            <TrendingUp class="h-5 w-5 text-green-500" />
            <span class="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Live</span>
            <span class="text-sm text-slate-500 dark:text-slate-400">Prices</span>
          </div>
        </div>

        <div class="mb-6 sm:mb-8">
          <p class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Shop & Follow HIBIKISHOP</p>
          <SocialLinks variant="card" />
        </div>

        <NuxtLink
          to="/browse"
          class="gradient-primary inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-105 hover:shadow-xl hover:shadow-purple-500/40 sm:px-8 sm:py-4 sm:text-lg"
        >
          Browse Collection
          <ArrowRight class="h-5 w-5" />
        </NuxtLink>
      </div>
    </section>

    <!-- Featured Section -->
    <section class="mx-auto max-w-7xl px-4 py-8 sm:py-12">
      <div class="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Featured Cards</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 sm:text-base">Top cards by popularity</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="group in groups"
            :key="group"
            :class="[
              'rounded-full px-3.5 py-2 text-sm font-medium transition-all sm:px-4',
              selectedGroup === group
                ? 'gradient-primary text-white shadow-lg shadow-purple-500/30'
                : 'bg-white/80 text-slate-700 hover:bg-white dark:bg-black/50 dark:text-slate-300 dark:hover:bg-black/70'
            ]"
            @click="selectedGroup = group"
          >
            {{ group }}
          </button>
        </div>
      </div>

      <!-- Loading Skeleton -->
      <div v-if="loading" class="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-5">
        <div v-for="i in 5" :key="i" class="glass-card overflow-hidden rounded-2xl">
          <div class="aspect-square animate-pulse bg-gradient-to-br from-purple-200 to-pink-200 dark:from-purple-800 dark:to-pink-800" />
          <div class="space-y-3 p-4">
            <div class="h-3 w-1/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            <div class="h-4 w-full animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            <div class="h-4 w-2/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      </div>

      <!-- Cards Grid -->
      <div v-else class="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-5">
        <NuxtLink
          v-for="card in cards"
          :key="card.id"
          :to="`/card/${card.id}`"
          class="group glass-card flex flex-col overflow-hidden rounded-2xl card-hover"
        >
          <div class="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
            <img
              :src="card.image"
              :alt="card.name"
              class="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
            <div class="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <span class="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">{{ card.card_type }}</span>
            <span v-if="card.is_in_promotion" class="absolute left-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">-{{ card.discount_rate }}%</span>
          </div>
          <div class="flex flex-1 flex-col p-3">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">{{ card.member_name }}</p>
            <h3 class="mt-0.5 line-clamp-2 min-h-[2.5rem] text-[13px] font-medium leading-snug text-slate-800 dark:text-slate-200">{{ card.name }}</h3>
            <div class="mt-auto pt-2">
              <template v-if="(card.discounted_price || card.price) > 0">
                <div class="flex items-baseline gap-1.5 flex-wrap">
                  <span class="text-[15px] font-bold text-slate-900 dark:text-white">Rp {{ formatIDR(card.discounted_price || card.price) }}</span>
                  <span v-if="card.is_in_promotion" class="text-[11px] text-slate-400 line-through dark:text-slate-500">Rp {{ formatIDR(card.price) }}</span>
                </div>
                <p class="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">${{ (card.discounted_price || card.price).toFixed(2) }}</p>
              </template>
              <span v-else class="text-[13px] font-medium text-slate-400 dark:text-slate-500">Tidak tersedia</span>
            </div>
          </div>
        </NuxtLink>
      </div>

      <div v-if="!loading && cards.length > 0" class="mt-8 text-center">
        <NuxtLink to="/browse" class="glass-card inline-flex items-center gap-2 rounded-full px-6 py-3 font-medium text-slate-700 transition-all hover:shadow-lg dark:text-slate-300">
          View All Cards
          <ArrowRight class="h-4 w-4" />
        </NuxtLink>
      </div>
    </section>

    <!-- Features -->
    <section class="mx-auto max-w-7xl px-4 py-10 sm:py-16">
      <h2 class="mb-8 text-center text-2xl font-bold text-slate-900 dark:text-white sm:mb-12 sm:text-3xl">Why Track Here?</h2>
      <div class="grid gap-4 sm:gap-6 md:grid-cols-3">
        <div class="glass-card rounded-3xl p-6 text-center card-hover sm:p-8">
          <div class="gradient-primary mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white sm:h-16 sm:w-16">
            <DollarSign class="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <h3 class="mb-2 text-base font-semibold text-slate-900 dark:text-white sm:text-lg">Price Tracking</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Monitor real-time prices from <a href="https://pocamarket.com" target="_blank" rel="noopener noreferrer" class="font-medium text-purple-600 underline-offset-2 hover:underline dark:text-purple-400">Pocamarket</a> with history charts</p>
        </div>
        <div class="glass-card rounded-3xl p-6 text-center card-hover sm:p-8">
          <div class="gradient-primary mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white sm:h-16 sm:w-16">
            <TrendingUp class="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <h3 class="mb-2 text-base font-semibold text-slate-900 dark:text-white sm:text-lg">Collection Stats</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Track owned cards, wishlist, and total portfolio value</p>
        </div>
        <div class="glass-card rounded-3xl p-6 text-center card-hover sm:p-8">
          <div class="gradient-primary mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white sm:h-16 sm:w-16">
            <Search class="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <h3 class="mb-2 text-base font-semibold text-slate-900 dark:text-white sm:text-lg">Smart Filters</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Filter by group, member, card type with instant search</p>
        </div>
      </div>
    </section>

    <SiteFooter />

    <MobileTabBar />
  </div>
</template>
