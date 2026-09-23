<script setup lang="ts">
import {
  Sparkles, ArrowRight, Heart, Package, DollarSign,
  TrendingUp, Users, Zap, Search, Eye
} from 'lucide-vue-next'

const groups = ['IVE', 'aespa', 'Hearts2Hearts']
const selectedGroup = ref('IVE')

const cards = ref<any[]>([])
const loading = ref(true)

onMounted(() => { loadCards() })

watch(selectedGroup, () => { loadCards() })

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
    <section class="relative overflow-hidden px-4 pb-16 pt-12">
      <div class="absolute left-10 top-10 h-72 w-72 rounded-full bg-purple-300/30 blur-3xl dark:bg-purple-500/20" />
      <div class="absolute bottom-10 right-10 h-72 w-72 rounded-full bg-pink-300/30 blur-3xl dark:bg-pink-500/20" />

      <div class="relative mx-auto max-w-4xl text-center">
        <div class="mb-6 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 shadow-lg backdrop-blur dark:bg-black/50">
          <Sparkles class="h-5 w-5 text-purple-500" />
          <span class="font-semibold text-slate-800 dark:text-slate-200">K-Pop Photocard Tracker</span>
        </div>

        <h1 class="mb-4 text-5xl font-bold tracking-tight text-slate-900 dark:text-white md:text-6xl">
          Track Your
          <span class="gradient-text">Photocards</span>
          Collection
        </h1>

        <p class="mb-8 text-lg text-slate-500 dark:text-slate-400">
          Real-time prices from Pocamarket. IVE, aespa, Hearts2Hearts.
        </p>

        <div class="mb-8 flex flex-wrap justify-center gap-6">
          <div class="glass-card flex items-center gap-3 rounded-2xl px-6 py-3">
            <Users class="h-5 w-5 text-purple-500" />
            <span class="text-2xl font-bold text-slate-900 dark:text-white">3</span>
            <span class="text-sm text-slate-500 dark:text-slate-400">Groups</span>
          </div>
          <div class="glass-card flex items-center gap-3 rounded-2xl px-6 py-3">
            <Package class="h-5 w-5 text-pink-500" />
            <span class="text-2xl font-bold text-slate-900 dark:text-white">16K+</span>
            <span class="text-sm text-slate-500 dark:text-slate-400">Cards</span>
          </div>
          <div class="glass-card flex items-center gap-3 rounded-2xl px-6 py-3">
            <TrendingUp class="h-5 w-5 text-green-500" />
            <span class="text-2xl font-bold text-slate-900 dark:text-white">Live</span>
            <span class="text-sm text-slate-500 dark:text-slate-400">Prices</span>
          </div>
        </div>

        <NuxtLink
          to="/browse"
          class="gradient-primary inline-flex items-center gap-2 rounded-full px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-105 hover:shadow-xl hover:shadow-purple-500/40"
        >
          Browse Collection
          <ArrowRight class="h-5 w-5" />
        </NuxtLink>
      </div>
    </section>

    <!-- Featured Section -->
    <section class="mx-auto max-w-7xl px-4 py-12">
      <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-slate-900 dark:text-white">Featured Cards</h2>
          <p class="text-slate-500 dark:text-slate-400">Top cards by popularity</p>
        </div>

        <div class="flex gap-2">
          <button
            v-for="group in groups"
            :key="group"
            :class="[
              'rounded-full px-4 py-2 text-sm font-medium transition-all',
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
      <div v-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
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
      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        <NuxtLink
          v-for="card in cards"
          :key="card.id"
          :to="`/card/${card.id}`"
          class="group glass-card overflow-hidden rounded-2xl card-hover"
        >
          <div class="relative aspect-square overflow-hidden">
            <img :src="card.image" :alt="card.name" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div class="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur">{{ card.card_type }}</div>
            <div v-if="card.is_in_promotion" class="absolute left-2 top-2 rounded-full bg-green-500 px-2 py-1 text-xs font-bold text-white">-{{ card.discount_rate }}%</div>
          </div>
          <div class="p-4">
            <p class="mb-1 text-xs font-medium text-purple-600 dark:text-purple-400">{{ card.member_name }}</p>
            <h3 class="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{{ card.name }}</h3>
            <div class="mt-3">
              <span class="text-xl font-bold text-slate-900 dark:text-white">${{ card.discounted_price || card.price }}</span>
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
    <section class="mx-auto max-w-7xl px-4 py-16">
      <h2 class="mb-12 text-center text-3xl font-bold text-slate-900 dark:text-white">Why Track Here?</h2>
      <div class="grid gap-6 md:grid-cols-3">
        <div class="glass-card rounded-3xl p-8 text-center card-hover">
          <div class="gradient-primary mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white">
            <DollarSign class="h-8 w-8" />
          </div>
          <h3 class="mb-2 text-lg font-semibold text-slate-900 dark:text-white">Price Tracking</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Monitor real-time prices from Pocamarket with history charts</p>
        </div>
        <div class="glass-card rounded-3xl p-8 text-center card-hover">
          <div class="gradient-primary mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white">
            <TrendingUp class="h-8 w-8" />
          </div>
          <h3 class="mb-2 text-lg font-semibold text-slate-900 dark:text-white">Collection Stats</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Track owned cards, wishlist, and total portfolio value</p>
        </div>
        <div class="glass-card rounded-3xl p-8 text-center card-hover">
          <div class="gradient-primary mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white">
            <Search class="h-8 w-8" />
          </div>
          <h3 class="mb-2 text-lg font-semibold text-slate-900 dark:text-white">Smart Filters</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400">Filter by group, member, card type with instant search</p>
        </div>
      </div>
    </section>

    <footer class="border-t border-slate-200/50 bg-white/50 py-8 backdrop-blur dark:border-slate-800/50 dark:bg-black/50">
      <div class="mx-auto max-w-7xl px-4 text-center">
        <p class="flex items-center justify-center gap-1 text-sm text-slate-500 dark:text-slate-400">
          Built with <Heart class="h-4 w-4 fill-purple-500 text-purple-500" /> for K-Pop collectors
        </p>
      </div>
    </footer>
  </div>
</template>
