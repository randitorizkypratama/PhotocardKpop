<script setup lang="ts">
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
  if (success) {
    showAddDialog.value = false
    boughtPrice.value = null
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 dark:from-slate-950 dark:via-purple-950 dark:to-slate-950">
    <!-- Header -->
    <header class="sticky top-0 z-50 glass border-b border-white/20">
      <div class="container mx-auto flex h-16 items-center justify-between px-4">
        <button @click="$router.back()" class="flex items-center gap-2 text-foreground transition-opacity hover:opacity-70">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
          <span class="text-sm font-medium">Back</span>
        </button>
        <NuxtLink to="/" class="flex items-center gap-2">
          <span class="text-xl">✨</span>
        </NuxtLink>
      </div>
    </header>

    <main class="container mx-auto px-4 py-8">
      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-16">
        <div class="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="py-16 text-center">
        <div class="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-100 text-4xl dark:bg-red-900/30">
          ❌
        </div>
        <h3 class="mb-2 text-xl font-semibold text-foreground">Error loading card</h3>
        <p class="text-muted-foreground">{{ error }}</p>
      </div>

      <!-- Card Detail -->
      <div v-else-if="card" class="grid gap-8 lg:grid-cols-2">
        <!-- Card Image -->
        <div class="flex justify-center">
          <div class="glass-card w-full max-w-md overflow-hidden rounded-3xl shadow-2xl">
            <div class="relative aspect-square overflow-hidden">
              <img :src="card.image" :alt="card.name" class="h-full w-full object-cover" />
              <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              
              <!-- Badges -->
              <div class="absolute top-4 left-4 flex gap-2">
                <span class="rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white backdrop-blur">
                  {{ card.group_name }}
                </span>
                <span class="rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white backdrop-blur">
                  {{ card.card_type }}
                </span>
              </div>
              
              <div v-if="card.is_in_promotion" class="absolute top-4 right-4 rounded-full bg-green-500 px-3 py-1 text-sm font-bold text-white">
                -{{ card.discount_rate }}%
              </div>
            </div>
          </div>
        </div>

        <!-- Card Info -->
        <div class="space-y-6">
          <!-- Title -->
          <div>
            <p class="mb-2 text-sm font-medium text-primary">{{ card.member_name }}</p>
            <h1 class="text-3xl font-bold text-foreground">{{ card.name }}</h1>
          </div>

          <!-- Price Card -->
          <div class="glass-card rounded-3xl p-6">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted-foreground">Current Price</p>
                <p class="text-4xl font-bold text-foreground">${{ card.discounted_price || card.price }}</p>
              </div>
              <div v-if="card.is_in_promotion" class="text-right">
                <p class="text-sm text-muted-foreground line-through">${{ card.price }}</p>
                <p class="text-2xl font-bold text-green-500">-{{ card.discount_rate }}%</p>
              </div>
            </div>
          </div>

          <!-- Stats Grid -->
          <div class="grid grid-cols-3 gap-4">
            <div class="glass-card rounded-2xl p-4 text-center">
              <p class="text-3xl font-bold text-foreground">{{ card.wish_count }}</p>
              <p class="mt-1 text-xs text-muted-foreground">Wishlist</p>
            </div>
            <div class="glass-card rounded-2xl p-4 text-center">
              <p class="text-3xl font-bold text-foreground">{{ card.sales_volume }}</p>
              <p class="mt-1 text-xs text-muted-foreground">Sold</p>
            </div>
            <div class="glass-card rounded-2xl p-4 text-center">
              <p class="text-3xl font-bold text-foreground">{{ card.stocked_count }}</p>
              <p class="mt-1 text-xs text-muted-foreground">In Stock</p>
            </div>
          </div>

          <!-- Price Trend -->
          <div v-if="history.length >= 2" class="glass-card rounded-3xl p-6">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted-foreground">Price Trend</p>
                <div class="flex items-center gap-3">
                  <span
                    :class="[
                      'text-3xl font-bold',
                      getPriceTrend() === 'up' ? 'text-red-500' : 
                      getPriceTrend() === 'down' ? 'text-green-500' : 'text-muted-foreground'
                    ]"
                  >
                    {{ getPriceTrend() === 'up' ? '↑' : getPriceTrend() === 'down' ? '↓' : '→' }}
                  </span>
                  <span :class="[
                    'text-lg font-semibold',
                    getPriceChange() > 0 ? 'text-red-500' : 
                    getPriceChange() < 0 ? 'text-green-500' : 'text-muted-foreground'
                  ]">
                    {{ getPriceChange() > 0 ? '+' : '' }}${{ getPriceChange().toFixed(2) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Add to Collection Button -->
          <button
            class="gradient-primary w-full rounded-2xl px-6 py-4 text-lg font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/40"
            @click="showAddDialog = true"
          >
            Add to Collection
          </button>

          <!-- Price History -->
          <div v-if="history.length > 0" class="glass-card rounded-3xl p-6">
            <h3 class="mb-4 text-lg font-semibold text-foreground">Price History</h3>
            <div class="space-y-3">
              <div
                v-for="entry in history.slice(0, 8)"
                :key="entry.id"
                class="flex items-center justify-between rounded-2xl bg-white/50 p-4 backdrop-blur dark:bg-black/30"
              >
                <div>
                  <p class="text-lg font-semibold text-foreground">${{ entry.price }}</p>
                  <p class="text-xs text-muted-foreground">{{ formatDate(entry.recorded_at) }}</p>
                </div>
                <div class="text-right text-xs text-muted-foreground">
                  <p>❤️ {{ entry.wish_count }}</p>
                  <p>📦 {{ entry.stocked_count }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Add to Collection Dialog -->
      <Teleport to="body">
        <Transition name="modal">
          <div
            v-if="showAddDialog"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            @click.self="showAddDialog = false"
          >
            <div class="glass-card w-full max-w-md rounded-3xl p-6 shadow-2xl">
              <h2 class="mb-6 text-xl font-semibold text-foreground">Add to Collection</h2>
              
              <div class="mb-6">
                <label class="mb-3 block text-sm font-medium text-foreground">Status</label>
                <div class="grid grid-cols-2 gap-3">
                  <button
                    :class="[
                      'rounded-2xl border-2 px-4 py-3 text-sm font-medium transition-all',
                      addToStatus === 'wishlist'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-transparent bg-muted text-foreground hover:bg-muted/80'
                    ]"
                    @click="addToStatus = 'wishlist'"
                  >
                    ❤️ Wishlist
                  </button>
                  <button
                    :class="[
                      'rounded-2xl border-2 px-4 py-3 text-sm font-medium transition-all',
                      addToStatus === 'owned'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-transparent bg-muted text-foreground hover:bg-muted/80'
                    ]"
                    @click="addToStatus = 'owned'"
                  >
                    ✅ Owned
                  </button>
                </div>
              </div>

              <div v-if="addToStatus === 'owned'" class="mb-6">
                <label class="mb-2 block text-sm font-medium text-foreground">Bought Price (USD)</label>
                <input
                  v-model="boughtPrice"
                  type="number"
                  step="0.01"
                  placeholder="Optional"
                  class="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div class="flex gap-3">
                <button
                  class="flex-1 rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition-all hover:bg-muted"
                  @click="showAddDialog = false"
                >
                  Cancel
                </button>
                <button
                  class="gradient-primary flex-1 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg shadow-primary/30 transition-all hover:scale-[1.02]"
                  @click="handleAddToCollection"
                >
                  Add
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
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
