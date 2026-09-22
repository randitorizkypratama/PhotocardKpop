<script setup lang="ts">
import {
  ArrowLeft, Sparkles, TrendingUp, TrendingDown, Minus,
  Heart, ShoppingCart, Package, Tag, DollarSign,
  X, Check, Clock
} from 'lucide-vue-next'

const route = useRoute()
const cardId = parseInt(route.params.id as string)

const { history, fetchPriceHistory, getPriceTrend, getPriceChange } = usePriceHistory()
const { addToCollection } = useCollection()

const card = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const showAddDialog = ref(false)
const addToStatus = ref<'owned' | 'wishlist'>('wishlist')
const boughtPrice = ref<number | null>(null)

onMounted(async () => {
  try {
    const response = await $fetch(`/api/cards/${cardId}`)
    if (response.success) {
      card.value = response.data
      await fetchPriceHistory(cardId)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch card'
  } finally {
    loading.value = false
  }
})

async function handleAddToCollection() {
  const success = await addToCollection(cardId, addToStatus.value, boughtPrice.value || undefined)
  if (success) { showAddDialog.value = false; boughtPrice.value = null }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 dark:from-slate-950 dark:via-purple-950 dark:to-slate-950">
    <header class="sticky top-0 z-50 glass border-b border-white/20">
      <div class="container mx-auto flex h-16 items-center justify-between px-4">
        <button @click="$router.back()" class="flex items-center gap-2 text-slate-700 transition-opacity hover:opacity-70 dark:text-slate-300">
          <ArrowLeft class="h-5 w-5" />
          <span class="text-sm font-medium">Back</span>
        </button>
        <NuxtLink to="/" class="flex items-center gap-2">
          <Sparkles class="h-5 w-5 text-purple-500" />
        </NuxtLink>
      </div>
    </header>

    <main class="container mx-auto px-4 py-8">
      <div v-if="loading" class="flex justify-center py-16">
        <div class="h-12 w-12 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
      </div>

      <div v-else-if="error" class="py-16 text-center">
        <div class="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-100 dark:bg-red-900/30">
          <X class="h-10 w-10 text-red-500" />
        </div>
        <h3 class="mb-2 text-xl font-semibold text-slate-900 dark:text-white">Error loading card</h3>
        <p class="text-slate-500 dark:text-slate-400">{{ error }}</p>
      </div>

      <div v-else-if="card" class="grid gap-8 lg:grid-cols-2">
        <div class="flex justify-center">
          <div class="glass-card w-full max-w-md overflow-hidden rounded-3xl shadow-2xl">
            <div class="relative aspect-square overflow-hidden">
              <img :src="card.image" :alt="card.name" class="h-full w-full object-cover" />
              <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              <div class="absolute left-4 top-4 flex gap-2">
                <span class="rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white backdrop-blur">{{ card.group_name }}</span>
                <span class="rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white backdrop-blur">{{ card.card_type }}</span>
              </div>
              <div v-if="card.is_in_promotion" class="absolute right-4 top-4 rounded-full bg-green-500 px-3 py-1 text-sm font-bold text-white">-{{ card.discount_rate }}%</div>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <div>
            <p class="mb-2 text-sm font-medium text-purple-600 dark:text-purple-400">{{ card.member_name }}</p>
            <h1 class="text-3xl font-bold text-slate-900 dark:text-white">{{ card.name }}</h1>
          </div>

          <div class="glass-card rounded-3xl p-6">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-slate-500 dark:text-slate-400">Current Price</p>
                <p class="text-4xl font-bold text-slate-900 dark:text-white">${{ card.discounted_price || card.price }}</p>
              </div>
              <div v-if="card.is_in_promotion" class="text-right">
                <p class="text-sm text-slate-400 line-through">${{ card.price }}</p>
                <p class="text-2xl font-bold text-green-500">-{{ card.discount_rate }}%</p>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div class="glass-card rounded-2xl p-4 text-center">
              <Heart class="mx-auto mb-1 h-5 w-5 text-pink-500" />
              <p class="text-2xl font-bold text-slate-900 dark:text-white">{{ card.wish_count }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">Wishlist</p>
            </div>
            <div class="glass-card rounded-2xl p-4 text-center">
              <ShoppingCart class="mx-auto mb-1 h-5 w-5 text-blue-500" />
              <p class="text-2xl font-bold text-slate-900 dark:text-white">{{ card.sales_volume }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">Sold</p>
            </div>
            <div class="glass-card rounded-2xl p-4 text-center">
              <Package class="mx-auto mb-1 h-5 w-5 text-green-500" />
              <p class="text-2xl font-bold text-slate-900 dark:text-white">{{ card.stocked_count }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">In Stock</p>
            </div>
          </div>

          <div v-if="history.length >= 2" class="glass-card rounded-3xl p-6">
            <p class="mb-2 text-sm text-slate-500 dark:text-slate-400">Price Trend</p>
            <div class="flex items-center gap-3">
              <TrendingUp v-if="getPriceTrend() === 'up'" class="h-8 w-8 text-red-500" />
              <TrendingDown v-else-if="getPriceTrend() === 'down'" class="h-8 w-8 text-green-500" />
              <Minus v-else class="h-8 w-8 text-slate-400" />
              <span :class="[
                'text-lg font-semibold',
                getPriceChange() > 0 ? 'text-red-500' : getPriceChange() < 0 ? 'text-green-500' : 'text-slate-500'
              ]">
                {{ getPriceChange() > 0 ? '+' : '' }}${{ getPriceChange().toFixed(2) }}
              </span>
            </div>
          </div>

          <button class="gradient-primary flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-lg font-semibold text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/40" @click="showAddDialog = true">
            <Tag class="h-5 w-5" />
            Add to Collection
          </button>

          <div v-if="history.length > 0" class="glass-card rounded-3xl p-6">
            <h3 class="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Price History</h3>
            <div class="space-y-3">
              <div v-for="entry in history.slice(0, 8)" :key="entry.id" class="flex items-center justify-between rounded-2xl bg-white/50 p-4 backdrop-blur dark:bg-black/30">
                <div>
                  <p class="text-lg font-semibold text-slate-900 dark:text-white">${{ entry.price }}</p>
                  <p class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock class="h-3 w-3" />
                    {{ formatDate(entry.recorded_at) }}
                  </p>
                </div>
                <div class="text-right text-xs text-slate-500 dark:text-slate-400">
                  <p class="flex items-center gap-1"><Heart class="h-3 w-3 text-pink-500" /> {{ entry.wish_count }}</p>
                  <p class="flex items-center gap-1"><Package class="h-3 w-3 text-green-500" /> {{ entry.stocked_count }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dialog -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showAddDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" @click.self="showAddDialog = false">
            <div class="glass-card w-full max-w-md rounded-3xl p-6 shadow-2xl">
              <h2 class="mb-6 text-xl font-semibold text-slate-900 dark:text-white">Add to Collection</h2>
              <div class="mb-6">
                <label class="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                <div class="grid grid-cols-2 gap-3">
                  <button :class="['flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-medium transition-all', addToStatus === 'wishlist' ? 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700']" @click="addToStatus = 'wishlist'">
                    <Heart class="h-4 w-4" /> Wishlist
                  </button>
                  <button :class="['flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-medium transition-all', addToStatus === 'owned' ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400' : 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700']" @click="addToStatus = 'owned'">
                    <Check class="h-4 w-4" /> Owned
                  </button>
                </div>
              </div>
              <div v-if="addToStatus === 'owned'" class="mb-6">
                <label class="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Bought Price (USD)</label>
                <input v-model="boughtPrice" type="number" step="0.01" placeholder="Optional" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </div>
              <div class="flex gap-3">
                <button class="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" @click="showAddDialog = false">Cancel</button>
                <button class="gradient-primary flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-[1.02]" @click="handleAddToCollection">
                  <Check class="h-4 w-4" /> Add
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
    </main>
  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: all 0.3s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; transform: scale(0.95); }
</style>
