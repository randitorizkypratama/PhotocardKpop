<script setup lang="ts">
const groups = ['IVE', 'aespa', 'Hearts2Hearts']
const selectedGroup = ref('IVE')
const searchQuery = ref('')

const cards = ref<any[]>([])
const loading = ref(true)

onMounted(() => {
  loadCards()
})

watch(selectedGroup, () => {
  searchQuery.value = ''
  loadCards()
})

async function loadCards() {
  loading.value = true
  
  try {
    const params = new URLSearchParams({
      group: selectedGroup.value,
      page: '1',
      limit: '10',
    })
    
    const response = await $fetch<any>(`/api/cards?${params}`)
    
    if (response.success) {
      cards.value = response.data
    }
  } catch (e) {
    console.error('Failed to load cards:', e)
  } finally {
    loading.value = false
  }
}

async function handleSearch() {
  if (!searchQuery.value.trim()) {
    loadCards()
    return
  }
  
  loading.value = true
  
  try {
    const params = new URLSearchParams({
      group: selectedGroup.value,
      search: searchQuery.value,
      page: '1',
      limit: '10',
    })
    
    const response = await $fetch<any>(`/api/cards?${params}`)
    
    if (response.success) {
      cards.value = response.data
    }
  } catch (e) {
    console.error('Search failed:', e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 dark:from-slate-950 dark:via-purple-950 dark:to-slate-950">
    <!-- Hero Section -->
    <section class="relative overflow-hidden px-4 pb-16 pt-12">
      <!-- Background decorations -->
      <div class="absolute left-10 top-10 h-72 w-72 rounded-full bg-purple-300/30 blur-3xl dark:bg-purple-500/20" />
      <div class="absolute bottom-10 right-10 h-72 w-72 rounded-full bg-pink-300/30 blur-3xl dark:bg-pink-500/20" />
      
      <div class="relative mx-auto max-w-4xl text-center">
        <!-- Logo -->
        <div class="mb-6 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 shadow-lg backdrop-blur dark:bg-black/50">
          <span class="text-2xl">✨</span>
          <span class="font-semibold text-foreground">K-Pop Photocard Tracker</span>
        </div>
        
        <!-- Heading -->
        <h1 class="mb-4 text-5xl font-bold tracking-tight text-foreground md:text-6xl">
          Track Your
          <span class="gradient-text">Photocards</span>
          Collection
        </h1>
        
        <p class="mb-8 text-lg text-muted-foreground">
          Real-time prices from Pocamarket. IVE, aespa, Hearts2Hearts.
        </p>
        
        <!-- Stats -->
        <div class="mb-8 flex flex-wrap justify-center gap-6">
          <div class="glass-card rounded-2xl px-6 py-3">
            <span class="text-2xl font-bold text-foreground">3</span>
            <span class="ml-2 text-sm text-muted-foreground">Groups</span>
          </div>
          <div class="glass-card rounded-2xl px-6 py-3">
            <span class="text-2xl font-bold text-foreground">16K+</span>
            <span class="ml-2 text-sm text-muted-foreground">Cards</span>
          </div>
          <div class="glass-card rounded-2xl px-6 py-3">
            <span class="text-2xl font-bold text-foreground">Live</span>
            <span class="ml-2 text-sm text-muted-foreground">Prices</span>
          </div>
        </div>
        
        <!-- CTA -->
        <NuxtLink
          to="/browse"
          class="gradient-primary inline-flex items-center gap-2 rounded-full px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:scale-105 hover:shadow-xl hover:shadow-primary/40"
        >
          Browse Collection
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </NuxtLink>
      </div>
    </section>

    <!-- Featured Section -->
    <section class="mx-auto max-w-7xl px-4 py-12">
      <div class="mb-8 flex items-end justify-between">
        <div>
          <h2 class="text-2xl font-bold text-foreground">Featured Cards</h2>
          <p class="text-muted-foreground">Top cards by popularity</p>
        </div>
        
        <!-- Group Tabs -->
        <div class="flex gap-2">
          <button
            v-for="group in groups"
            :key="group"
            :class="[
              'rounded-full px-4 py-2 text-sm font-medium transition-all',
              selectedGroup === group
                ? 'gradient-primary text-white shadow-lg shadow-primary/30'
                : 'bg-white/80 text-foreground hover:bg-white dark:bg-black/50 dark:hover:bg-black/70'
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
          <div class="p-4 space-y-3">
            <div class="h-3 w-1/3 animate-pulse rounded-full bg-muted" />
            <div class="h-4 w-full animate-pulse rounded-full bg-muted" />
            <div class="h-4 w-2/3 animate-pulse rounded-full bg-muted" />
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
            <img
              :src="card.image"
              :alt="card.name"
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            
            <!-- Quick badge -->
            <div class="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur">
              {{ card.card_type }}
            </div>
            
            <!-- Promo badge -->
            <div v-if="card.is_in_promotion" class="absolute top-2 left-2 rounded-full bg-green-500 px-2 py-1 text-xs font-bold text-white">
              -{{ card.discount_rate }}%
            </div>
          </div>
          
          <div class="p-4">
            <p class="mb-1 text-xs font-medium text-primary">{{ card.member_name }}</p>
            <h3 class="line-clamp-2 text-sm font-semibold text-foreground">{{ card.name }}</h3>
            <div class="mt-3 flex items-center justify-between">
              <span class="text-xl font-bold text-foreground">${{ card.discounted_price || card.price }}</span>
              <div class="flex items-center gap-1 text-xs text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                {{ card.wish_count }}
              </div>
            </div>
          </div>
        </NuxtLink>
      </div>

      <!-- View All -->
      <div v-if="!loading && cards.length > 0" class="mt-8 text-center">
        <NuxtLink
          to="/browse"
          class="glass-card inline-flex items-center gap-2 rounded-full px-6 py-3 font-medium text-foreground transition-all hover:shadow-lg"
        >
          View All Cards
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </NuxtLink>
      </div>
    </section>

    <!-- Features Section -->
    <section class="mx-auto max-w-7xl px-4 py-16">
      <h2 class="mb-12 text-center text-3xl font-bold text-foreground">Why Track Here?</h2>
      
      <div class="grid gap-6 md:grid-cols-3">
        <div class="glass-card rounded-3xl p-8 text-center card-hover">
          <div class="gradient-primary mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl text-white">
            💰
          </div>
          <h3 class="mb-2 text-lg font-semibold text-foreground">Price Tracking</h3>
          <p class="text-sm text-muted-foreground">Monitor real-time prices from Pocamarket with history charts</p>
        </div>
        
        <div class="glass-card rounded-3xl p-8 text-center card-hover">
          <div class="gradient-primary mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl text-white">
            📊
          </div>
          <h3 class="mb-2 text-lg font-semibold text-foreground">Collection Stats</h3>
          <p class="text-sm text-muted-foreground">Track owned cards, wishlist, and total portfolio value</p>
        </div>
        
        <div class="glass-card rounded-3xl p-8 text-center card-hover">
          <div class="gradient-primary mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl text-white">
            🔍
          </div>
          <h3 class="mb-2 text-lg font-semibold text-foreground">Smart Filters</h3>
          <p class="text-sm text-muted-foreground">Filter by group, member, card type with instant search</p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-white/20 bg-white/50 py-8 backdrop-blur dark:bg-black/50">
      <div class="mx-auto max-w-7xl px-4 text-center">
        <p class="text-sm text-muted-foreground">
          Built with 💜 for K-Pop collectors
        </p>
      </div>
    </footer>
  </div>
</template>
