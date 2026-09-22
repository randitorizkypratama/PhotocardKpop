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
      limit: '20',
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
      limit: '20',
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
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="container mx-auto flex h-14 items-center px-4">
        <NuxtLink to="/" class="flex items-center space-x-2">
          <span class="text-xl font-bold">K-Pop PC</span>
        </NuxtLink>
        <nav class="ml-auto flex items-center space-x-4">
          <NuxtLink to="/" class="text-sm font-medium hover:underline">Home</NuxtLink>
          <NuxtLink to="/browse" class="text-sm font-medium hover:underline">Browse</NuxtLink>
          <NuxtLink to="/collection" class="text-sm font-medium hover:underline">Collection</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="container mx-auto px-4 py-6">
      <!-- Hero Section -->
      <section class="mb-8 text-center">
        <h1 class="mb-2 text-3xl font-bold">K-Pop Photocard Tracker</h1>
        <p class="text-muted-foreground">Track prices from Pocamarket - IVE, aespa, Hearts2Hearts</p>
      </section>

      <!-- Group Tabs -->
      <div class="mb-6 flex justify-center space-x-2">
        <button
          v-for="group in groups"
          :key="group"
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            selectedGroup === group
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          ]"
          @click="selectedGroup = group"
        >
          {{ group }}
        </button>
      </div>

      <!-- Search -->
      <div class="mb-6 flex justify-center">
        <form @submit.prevent="handleSearch" class="flex w-full max-w-md space-x-2">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search cards..."
            class="flex-1 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          />
          <button
            type="submit"
            class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Search
          </button>
        </form>
      </div>

      <!-- Loading Skeleton -->
      <div v-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div v-for="i in 10" :key="i" class="rounded-lg border bg-card shadow-sm overflow-hidden">
          <div class="aspect-square bg-muted animate-pulse" />
          <div class="p-3 space-y-2">
            <div class="h-4 bg-muted rounded w-1/3 animate-pulse" />
            <div class="h-4 bg-muted rounded w-full animate-pulse" />
            <div class="h-4 bg-muted rounded w-2/3 animate-pulse" />
            <div class="flex justify-between">
              <div class="h-6 bg-muted rounded w-1/4 animate-pulse" />
              <div class="h-4 bg-muted rounded w-1/4 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      <!-- Cards Grid -->
      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <NuxtLink
          v-for="card in cards"
          :key="card.id"
          :to="`/card/${card.id}`"
          class="group rounded-lg border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md"
        >
          <div class="aspect-square overflow-hidden rounded-t-lg">
            <img
              :src="card.image"
              :alt="card.name"
              class="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          </div>
          <div class="p-3">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-xs text-muted-foreground">{{ card.group_name }}</span>
              <span class="rounded-full bg-secondary px-2 py-0.5 text-xs">{{ card.card_type }}</span>
            </div>
            <h3 class="line-clamp-2 text-sm font-medium">{{ card.name }}</h3>
            <div class="mt-2 flex items-center justify-between">
              <span class="text-lg font-bold">${{ card.discounted_price || card.price }}</span>
              <span v-if="card.is_in_promotion" class="text-xs text-green-600">-{{ card.discount_rate }}%</span>
            </div>
            <p class="text-xs text-muted-foreground">{{ card.member_name }}</p>
          </div>
        </NuxtLink>
      </div>

      <div v-if="!loading && cards.length === 0" class="py-8 text-center text-muted-foreground">
        No cards found. Try syncing data first.
      </div>

      <!-- View More -->
      <div v-if="!loading && cards.length > 0" class="mt-8 text-center">
        <NuxtLink
          to="/browse"
          class="inline-flex rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          View All Cards
        </NuxtLink>
      </div>
    </main>
  </div>
</template>
