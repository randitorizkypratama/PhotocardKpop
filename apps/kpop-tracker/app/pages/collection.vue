<script setup lang="ts">
import {
  Sparkles, Heart, Package, DollarSign, Target,
  Trash2, X
} from 'lucide-vue-next'

const { items, stats, loading, fetchCollection, removeFromCollection } = useCollection()

const activeTab = ref<'all' | 'owned' | 'wishlist'>('all')

onMounted(() => { fetchCollection() })

const filteredItems = computed(() => {
  if (activeTab.value === 'all') return items.value
  return items.value.filter(item => item.status === activeTab.value)
})

async function handleRemove(id: number) {
  if (confirm('Remove from collection?')) await removeFromCollection(id)
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 dark:from-slate-950 dark:via-purple-950 dark:to-slate-950">
    <header class="sticky top-0 z-50 glass border-b border-white/20">
      <div class="container mx-auto flex h-16 items-center justify-between px-4">
        <NuxtLink to="/" class="flex items-center gap-2">
          <Sparkles class="h-5 w-5 text-purple-500" />
          <span class="text-lg font-bold text-slate-900 dark:text-white">K-Pop PC</span>
        </NuxtLink>
        <nav class="flex items-center gap-6">
          <NuxtLink to="/" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Home</NuxtLink>
          <NuxtLink to="/browse" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Browse</NuxtLink>
          <NuxtLink to="/collection" class="text-sm font-medium text-slate-900 dark:text-white">Collection</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="container mx-auto px-4 py-8">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-slate-900 dark:text-white">My Collection</h1>
        <p class="mt-1 text-slate-500 dark:text-slate-400">Manage your photocard collection</p>
      </div>

      <!-- Stats -->
      <div class="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="glass-card rounded-3xl p-6">
          <div class="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 dark:bg-green-900/30">
            <Package class="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <p class="text-3xl font-bold text-slate-900 dark:text-white">{{ stats.totalOwned }}</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">Owned Cards</p>
        </div>
        <div class="glass-card rounded-3xl p-6">
          <div class="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-100 dark:bg-pink-900/30">
            <Heart class="h-5 w-5 text-pink-600 dark:text-pink-400" />
          </div>
          <p class="text-3xl font-bold text-slate-900 dark:text-white">{{ stats.totalWishlist }}</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">Wishlist</p>
        </div>
        <div class="glass-card rounded-3xl p-6">
          <div class="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-900/30">
            <DollarSign class="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <p class="text-3xl font-bold text-slate-900 dark:text-white">{{ formatPrice(stats.totalOwnedValue) }}</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">Owned Value</p>
        </div>
        <div class="glass-card rounded-3xl p-6">
          <div class="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/30">
            <Target class="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <p class="text-3xl font-bold text-slate-900 dark:text-white">{{ formatPrice(stats.totalWishlistValue) }}</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">Wishlist Value</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="mb-8 flex gap-2">
        <button v-for="tab in [{ key: 'all', label: 'All', count: items.length }, { key: 'owned', label: 'Owned', count: stats.totalOwned }, { key: 'wishlist', label: 'Wishlist', count: stats.totalWishlist }]" :key="tab.key" :class="[
          'rounded-full px-5 py-2.5 text-sm font-medium transition-all',
          activeTab === tab.key
            ? 'gradient-primary text-white shadow-lg shadow-purple-500/30'
            : 'glass-card text-slate-700 hover:shadow-md dark:text-slate-300'
        ]" @click="activeTab = tab.key as any">
          {{ tab.label }} ({{ tab.count }})
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div v-for="i in 6" :key="i" class="glass-card overflow-hidden rounded-2xl">
          <div class="aspect-square animate-pulse bg-gradient-to-br from-purple-200 to-pink-200 dark:from-purple-800 dark:to-pink-800" />
          <div class="space-y-3 p-4">
            <div class="h-3 w-1/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            <div class="h-4 w-full animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            <div class="h-4 w-2/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="filteredItems.length === 0" class="py-16 text-center">
        <div class="gradient-primary mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl text-white">
          <Package class="h-10 w-10" />
        </div>
        <h3 class="mb-2 text-xl font-semibold text-slate-900 dark:text-white">No cards yet</h3>
        <p class="mb-6 text-slate-500 dark:text-slate-400">Start building your collection</p>
        <NuxtLink to="/browse" class="gradient-primary inline-flex items-center gap-2 rounded-full px-6 py-3 font-medium text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-105">
          Browse Cards
        </NuxtLink>
      </div>

      <!-- Grid -->
      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div v-for="item in filteredItems" :key="item.id" class="group glass-card relative overflow-hidden rounded-2xl card-hover">
          <div :class="['absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium backdrop-blur', item.status === 'owned' ? 'bg-green-500/90 text-white' : 'bg-blue-500/90 text-white']">
            <Package v-if="item.status === 'owned'" class="h-3 w-3" />
            <Heart v-else class="h-3 w-3" />
            {{ item.status === 'owned' ? 'Owned' : 'Wishlist' }}
          </div>
          <button class="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-red-500/90 text-white opacity-0 backdrop-blur transition-all group-hover:opacity-100 hover:bg-red-600" @click="handleRemove(item.id)">
            <Trash2 class="h-4 w-4" />
          </button>
          <NuxtLink :to="`/card/${item.card_id}`">
            <div class="relative aspect-square overflow-hidden">
              <img :src="item.image" :alt="item.name" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
              <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
            <div class="p-4">
              <div class="mb-1 flex items-center justify-between">
                <span class="text-xs font-medium text-purple-600 dark:text-purple-400">{{ item.group_name }}</span>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">{{ item.card_type }}</span>
              </div>
              <h3 class="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{{ item.name }}</h3>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ item.member_name }}</p>
              <div class="mt-3 flex items-center justify-between">
                <span class="text-xl font-bold text-slate-900 dark:text-white">{{ formatPrice(item.last_price) }}</span>
                <span v-if="item.bought_price" class="text-xs text-green-500">Bought: {{ formatPrice(item.bought_price) }}</span>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </main>
  </div>
</template>
