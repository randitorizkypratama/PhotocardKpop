<script setup lang="ts">
const { items, stats, loading, fetchCollection, removeFromCollection } = useCollection()

const activeTab = ref<'all' | 'owned' | 'wishlist'>('all')

onMounted(() => {
  fetchCollection()
})

const filteredItems = computed(() => {
  if (activeTab.value === 'all') return items.value
  return items.value.filter(item => item.status === activeTab.value)
})

async function handleRemove(id: number) {
  if (confirm('Remove from collection?')) {
    await removeFromCollection(id)
  }
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="container mx-auto flex h-14 items-center px-4">
        <NuxtLink to="/" class="flex items-center space-x-2">
          <span class="text-xl font-bold">🎴 K-Pop PC</span>
        </NuxtLink>
        <nav class="ml-auto flex items-center space-x-4">
          <NuxtLink to="/" class="text-sm font-medium hover:underline">Home</NuxtLink>
          <NuxtLink to="/browse" class="text-sm font-medium hover:underline">Browse</NuxtLink>
          <NuxtLink to="/collection" class="text-sm font-medium hover:underline">Collection</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="container mx-auto px-4 py-6">
      <h1 class="mb-6 text-2xl font-bold">My Collection</h1>

      <!-- Stats -->
      <div class="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="rounded-lg border p-4">
          <p class="text-sm text-muted-foreground">Owned</p>
          <p class="text-2xl font-bold">{{ stats.totalOwned }}</p>
        </div>
        <div class="rounded-lg border p-4">
          <p class="text-sm text-muted-foreground">Wishlist</p>
          <p class="text-2xl font-bold">{{ stats.totalWishlist }}</p>
        </div>
        <div class="rounded-lg border p-4">
          <p class="text-sm text-muted-foreground">Owned Value</p>
          <p class="text-2xl font-bold">{{ formatPrice(stats.totalOwnedValue) }}</p>
        </div>
        <div class="rounded-lg border p-4">
          <p class="text-sm text-muted-foreground">Wishlist Value</p>
          <p class="text-2xl font-bold">{{ formatPrice(stats.totalWishlistValue) }}</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="mb-6 flex space-x-2">
        <button
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          ]"
          @click="activeTab = 'all'"
        >
          All ({{ items.length }})
        </button>
        <button
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'owned'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          ]"
          @click="activeTab = 'owned'"
        >
          Owned ({{ stats.totalOwned }})
        </button>
        <button
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'wishlist'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          ]"
          @click="activeTab = 'wishlist'"
        >
          Wishlist ({{ stats.totalWishlist }})
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-8">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredItems.length === 0" class="py-12 text-center">
        <p class="mb-4 text-muted-foreground">No cards in your collection yet</p>
        <NuxtLink
          to="/browse"
          class="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Browse Cards
        </NuxtLink>
      </div>

      <!-- Collection Grid -->
      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="group relative rounded-lg border bg-card text-card-foreground shadow-sm"
        >
          <!-- Status Badge -->
          <div
            :class="[
              'absolute top-2 left-2 z-10 rounded-full px-2 py-1 text-xs font-medium',
              item.status === 'owned'
                ? 'bg-green-500 text-white'
                : 'bg-blue-500 text-white'
            ]"
          >
            {{ item.status === 'owned' ? 'Owned' : 'Wishlist' }}
          </div>

          <!-- Remove Button -->
          <button
            class="absolute top-2 right-2 z-10 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
            @click="handleRemove(item.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>

          <NuxtLink :to="`/card/${item.card_id}`">
            <div class="aspect-square overflow-hidden rounded-t-lg">
              <img
                :src="item.image"
                :alt="item.name"
                class="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            </div>
            <div class="p-3">
              <div class="mb-1 flex items-center justify-between">
                <span class="text-xs text-muted-foreground">{{ item.group_name }}</span>
                <span class="rounded-full bg-secondary px-2 py-0.5 text-xs">{{ item.card_type }}</span>
              </div>
              <h3 class="line-clamp-2 text-sm font-medium">{{ item.name }}</h3>
              <p class="mt-1 text-xs text-muted-foreground">{{ item.member_name }}</p>
              <div class="mt-2 flex items-center justify-between">
                <span class="text-lg font-bold">{{ formatPrice(item.last_price) }}</span>
                <span v-if="item.bought_price" class="text-xs text-muted-foreground">
                  Bought: {{ formatPrice(item.bought_price) }}
                </span>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </main>
  </div>
</template>
