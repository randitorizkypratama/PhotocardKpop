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
    hour: '2-digit',
    minute: '2-digit',
  })
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
      <div v-if="loading" class="flex justify-center py-8">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>

      <div v-else-if="error" class="py-8 text-center text-destructive">
        {{ error }}
      </div>

      <div v-else-if="card" class="grid gap-6 md:grid-cols-2">
        <!-- Card Image -->
        <div class="flex justify-center">
          <div class="w-full max-w-md overflow-hidden rounded-lg border">
            <img :src="card.image" :alt="card.name" class="w-full object-cover" />
          </div>
        </div>

        <!-- Card Info -->
        <div>
          <div class="mb-2 flex items-center space-x-2">
            <span class="rounded-full bg-secondary px-3 py-1 text-sm">{{ card.group_name }}</span>
            <span class="rounded-full bg-secondary px-3 py-1 text-sm">{{ card.card_type }}</span>
          </div>

          <h1 class="mb-2 text-2xl font-bold">{{ card.name }}</h1>
          <p class="mb-4 text-muted-foreground">{{ card.member_name }}</p>

          <!-- Price -->
          <div class="mb-6 rounded-lg border p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted-foreground">Current Price</p>
                <p class="text-3xl font-bold">${{ card.discounted_price || card.price }}</p>
              </div>
              <div v-if="card.is_in_promotion" class="text-right">
                <p class="text-sm text-muted-foreground line-through">${{ card.price }}</p>
                <p class="text-lg font-bold text-green-600">-{{ card.discount_rate }}%</p>
              </div>
            </div>
          </div>

          <!-- Stats -->
          <div class="mb-6 grid grid-cols-3 gap-4">
            <div class="rounded-lg border p-3 text-center">
              <p class="text-2xl font-bold">{{ card.wish_count }}</p>
              <p class="text-xs text-muted-foreground">Wishlist</p>
            </div>
            <div class="rounded-lg border p-3 text-center">
              <p class="text-2xl font-bold">{{ card.sales_volume }}</p>
              <p class="text-xs text-muted-foreground">Sold</p>
            </div>
            <div class="rounded-lg border p-3 text-center">
              <p class="text-2xl font-bold">{{ card.stocked_count }}</p>
              <p class="text-xs text-muted-foreground">In Stock</p>
            </div>
          </div>

          <!-- Price Trend -->
          <div v-if="history.length >= 2" class="mb-6 rounded-lg border p-4">
            <p class="mb-2 text-sm font-medium">Price Trend</p>
            <div class="flex items-center space-x-2">
              <span
                :class="[
                  'text-2xl font-bold',
                  getPriceTrend() === 'up' ? 'text-red-500' : 
                  getPriceTrend() === 'down' ? 'text-green-500' : 'text-muted-foreground'
                ]"
              >
                {{ getPriceTrend() === 'up' ? '↑' : getPriceTrend() === 'down' ? '↓' : '→' }}
              </span>
              <span :class="[
                'text-sm',
                getPriceChange() > 0 ? 'text-red-500' : 
                getPriceChange() < 0 ? 'text-green-500' : 'text-muted-foreground'
              ]">
                {{ getPriceChange() > 0 ? '+' : '' }}${{ getPriceChange().toFixed(2) }}
              </span>
            </div>
          </div>

          <!-- Add to Collection -->
          <button
            class="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            @click="showAddDialog = true"
          >
            Add to Collection
          </button>

          <!-- Price History -->
          <div v-if="history.length > 0" class="mt-6">
            <h3 class="mb-3 text-lg font-medium">Price History</h3>
            <div class="space-y-2">
              <div
                v-for="entry in history.slice(0, 10)"
                :key="entry.id"
                class="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p class="text-sm font-medium">${{ entry.price }}</p>
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
      <div
        v-if="showAddDialog"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        @click.self="showAddDialog = false"
      >
        <div class="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
          <h2 class="mb-4 text-lg font-medium">Add to Collection</h2>
          
          <div class="mb-4">
            <label class="mb-2 block text-sm font-medium">Status</label>
            <div class="flex space-x-2">
              <button
                :class="[
                  'flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                  addToStatus === 'wishlist'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-secondary'
                ]"
                @click="addToStatus = 'wishlist'"
              >
                Wishlist
              </button>
              <button
                :class="[
                  'flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                  addToStatus === 'owned'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-secondary'
                ]"
                @click="addToStatus = 'owned'"
              >
                Owned
              </button>
            </div>
          </div>

          <div v-if="addToStatus === 'owned'" class="mb-4">
            <label class="mb-2 block text-sm font-medium">Bought Price (USD)</label>
            <input
              v-model="boughtPrice"
              type="number"
              step="0.01"
              placeholder="Optional"
              class="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <div class="flex space-x-2">
            <button
              class="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
              @click="showAddDialog = false"
            >
              Cancel
            </button>
            <button
              class="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              @click="handleAddToCollection"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
