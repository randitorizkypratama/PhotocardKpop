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
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 dark:from-slate-950 dark:via-purple-950 dark:to-slate-950">
    <!-- Header -->
    <header class="sticky top-0 z-50 glass border-b border-white/20">
      <div class="container mx-auto flex h-16 items-center justify-between px-4">
        <NuxtLink to="/" class="flex items-center gap-2">
          <span class="text-xl">✨</span>
          <span class="text-lg font-bold text-foreground">K-Pop PC</span>
        </NuxtLink>
        <nav class="flex items-center gap-6">
          <NuxtLink to="/" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Home</NuxtLink>
          <NuxtLink to="/browse" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Browse</NuxtLink>
          <NuxtLink to="/collection" class="text-sm font-medium text-foreground">Collection</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="container mx-auto px-4 py-8">
      <!-- Page Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-foreground">My Collection</h1>
        <p class="mt-1 text-muted-foreground">Manage your photocard collection</p>
      </div>

      <!-- Stats Cards -->
      <div class="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="glass-card rounded-3xl p-6">
          <div class="mb-2 flex items-center gap-2">
            <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 text-xl dark:bg-green-900/30">✅</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{{ stats.totalOwned }}</p>
          <p class="text-sm text-muted-foreground">Owned Cards</p>
        </div>
        
        <div class="glass-card rounded-3xl p-6">
          <div class="mb-2 flex items-center gap-2">
            <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-xl dark:bg-blue-900/30">❤️</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{{ stats.totalWishlist }}</p>
          <p class="text-sm text-muted-foreground">Wishlist</p>
        </div>
        
        <div class="glass-card rounded-3xl p-6">
          <div class="mb-2 flex items-center gap-2">
            <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 text-xl dark:bg-purple-900/30">💰</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{{ formatPrice(stats.totalOwnedValue) }}</p>
          <p class="text-sm text-muted-foreground">Owned Value</p>
        </div>
        
        <div class="glass-card rounded-3xl p-6">
          <div class="mb-2 flex items-center gap-2">
            <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-100 text-xl dark:bg-pink-900/30">🎯</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{{ formatPrice(stats.totalWishlistValue) }}</p>
          <p class="text-sm text-muted-foreground">Wishlist Value</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="mb-8 flex gap-2">
        <button
          :class="[
            'rounded-full px-5 py-2.5 text-sm font-medium transition-all',
            activeTab === 'all'
              ? 'gradient-primary text-white shadow-lg shadow-primary/30'
              : 'glass-card text-foreground hover:shadow-md'
          ]"
          @click="activeTab = 'all'"
        >
          All ({{ items.length }})
        </button>
        <button
          :class="[
            'rounded-full px-5 py-2.5 text-sm font-medium transition-all',
            activeTab === 'owned'
              ? 'gradient-primary text-white shadow-lg shadow-primary/30'
              : 'glass-card text-foreground hover:shadow-md'
          ]"
          @click="activeTab = 'owned'"
        >
          Owned ({{ stats.totalOwned }})
        </button>
        <button
          :class="[
            'rounded-full px-5 py-2.5 text-sm font-medium transition-all',
            activeTab === 'wishlist'
              ? 'gradient-primary text-white shadow-lg shadow-primary/30'
              : 'glass-card text-foreground hover:shadow-md'
          ]"
          @click="activeTab = 'wishlist'"
        >
          Wishlist ({{ stats.totalWishlist }})
        </button>
      </div>

      <!-- Loading Skeleton -->
      <div v-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div v-for="i in 6" :key="i" class="glass-card overflow-hidden rounded-2xl">
          <div class="aspect-square animate-pulse bg-gradient-to-br from-purple-200 to-pink-200 dark:from-purple-800 dark:to-pink-800" />
          <div class="p-4 space-y-3">
            <div class="h-3 w-1/3 animate-pulse rounded-full bg-muted" />
            <div class="h-4 w-full animate-pulse rounded-full bg-muted" />
            <div class="h-4 w-2/3 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredItems.length === 0" class="py-16 text-center">
        <div class="gradient-primary mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl text-4xl text-white">
          📦
        </div>
        <h3 class="mb-2 text-xl font-semibold text-foreground">No cards yet</h3>
        <p class="mb-6 text-muted-foreground">Start building your collection</p>
        <NuxtLink
          to="/browse"
          class="gradient-primary inline-flex items-center gap-2 rounded-full px-6 py-3 font-medium text-white shadow-lg shadow-primary/30 transition-all hover:scale-105"
        >
          Browse Cards
        </NuxtLink>
      </div>

      <!-- Collection Grid -->
      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="group glass-card relative overflow-hidden rounded-2xl card-hover"
        >
          <!-- Status Badge -->
          <div
            :class="[
              'absolute top-2 left-2 z-10 rounded-full px-3 py-1 text-xs font-medium backdrop-blur',
              item.status === 'owned'
                ? 'bg-green-500/90 text-white'
                : 'bg-blue-500/90 text-white'
            ]"
          >
            {{ item.status === 'owned' ? '✅ Owned' : '❤️ Wishlist' }}
          </div>

          <!-- Remove Button -->
          <button
            class="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-red-500/90 text-white opacity-0 backdrop-blur transition-all group-hover:opacity-100 hover:bg-red-600"
            @click="handleRemove(item.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>

          <NuxtLink :to="`/card/${item.card_id}`">
            <div class="relative aspect-square overflow-hidden">
              <img
                :src="item.image"
                :alt="item.name"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
            
            <div class="p-4">
              <div class="mb-1 flex items-center justify-between">
                <span class="text-xs font-medium text-primary">{{ item.group_name }}</span>
                <span class="rounded-full bg-muted px-2 py-0.5 text-xs">{{ item.card_type }}</span>
              </div>
              <h3 class="line-clamp-2 text-sm font-semibold text-foreground">{{ item.name }}</h3>
              <p class="mt-1 text-xs text-muted-foreground">{{ item.member_name }}</p>
              <div class="mt-3 flex items-center justify-between">
                <span class="text-xl font-bold text-foreground">{{ formatPrice(item.last_price) }}</span>
                <span v-if="item.bought_price" class="text-xs text-green-500">
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
