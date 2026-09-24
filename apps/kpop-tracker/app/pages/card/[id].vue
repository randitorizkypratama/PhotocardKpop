<script setup lang="ts">
import {
  TrendingUp, TrendingDown, Minus,
  Heart, Tag, Check, Clock, ExternalLink, AlertCircle, Package
} from 'lucide-vue-next'
import { groupAccent, groupDot, formatIDR, formatUSD } from '@/lib/catalog'

const route = useRoute()
const cardId = parseInt(route.params.id as string)

useHead({
  title: computed(() => (card.value ? `${card.value.name} — HIBIKISHOP PC` : 'Photocard — HIBIKISHOP PC')),
})

const { history, fetchPriceHistory, getPriceTrend, getPriceChange } = usePriceHistory()
const {
  addToCollection, fetchCollection, findItemByCardId, toggleWishlist, wishlistIds,
} = useCollection()

const card = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const showAddDialog = ref(false)
const addToStatus = ref<'owned' | 'wishlist'>('wishlist')
const boughtPrice = ref<string | number>('')
const exchangeRates = ref<any>(null)
const adding = ref(false)

onMounted(async () => {
  fetchCollection()
  try {
    const [cardRes, ratesRes] = await Promise.all([
      $fetch<any>(`/api/cards/${cardId}`),
      $fetch<any>('/api/exchangerate').catch(() => ({ success: false, data: null })),
    ])
    if (cardRes.success) {
      card.value = cardRes.data
      await fetchPriceHistory(cardId)
    } else {
      error.value = 'Photocard not found.'
    }
    if (ratesRes.success) {
      exchangeRates.value = ratesRes.data
    }
  } catch (e) {
    error.value = 'Unable to load this photocard.'
  } finally {
    loading.value = false
  }
})

const rate = computed(() => exchangeRates.value?.usd?.rate || 17800)
const isWishlisted = computed(() => wishlistIds.value.has(cardId))
const collectionItem = computed(() => findItemByCardId(cardId))

async function handleAddToCollection() {
  if (!card.value) return
  adding.value = true
  const price = boughtPrice.value === '' || boughtPrice.value == null ? undefined : Number(boughtPrice.value)
  const success = await addToCollection(cardId, addToStatus.value, price)
  adding.value = false
  if (success) {
    showAddDialog.value = false
    boughtPrice.value = ''
  }
}

async function handleWishlistToggle() {
  await toggleWishlist(cardId)
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const effectivePrice = computed(() => {
  if (!card.value) return 0
  return Number(card.value.discounted_price) || Number(card.value.price) || 0
})

const chartData = computed(() => {
  const chronological = [...history.value].reverse()
  if (chronological.length < 2) return null

  const prices = chronological.map(h => Number(h.price) || 0)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const w = 600
  const h = 160
  const padX = 8
  const padY = 16

  const points = chronological.map((entry, i) => {
    const x = padX + (i / (chronological.length - 1)) * (w - padX * 2)
    const y = padY + (1 - ((Number(entry.price) || 0) - min) / range) * (h - padY * 2)
    return { x, y, price: entry.price, date: entry.recorded_at }
  })

  return {
    points,
    min,
    max,
    path: points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
    areaPath: `M ${points[0].x.toFixed(1)} ${(h - padY).toFixed(1)} ` +
      points.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
      ` L ${points[points.length - 1].x.toFixed(1)} ${(h - padY).toFixed(1)} Z`,
    labels: {
      first: formatDate(chronological[0].recorded_at),
      last: formatDate(chronological[chronological.length - 1].recorded_at),
    },
  }
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader back />

    <main class="page-shell py-6 sm:py-8">
      <!-- Loading skeleton -->
      <div v-if="loading" class="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <div class="pc-skeleton mx-auto w-full max-w-md">
          <div class="skeleton-block aspect-square rounded-none" />
        </div>
        <div class="space-y-4">
          <div class="skeleton-block h-4 w-24" />
          <div class="skeleton-block h-8 w-3/4" />
          <div class="skeleton-block h-4 w-40" />
          <div class="skeleton-block h-24 w-full" />
          <div class="skeleton-block h-12 w-full" />
          <div class="skeleton-block h-48 w-full" />
        </div>
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-900/50 dark:bg-red-950/40"
        role="alert"
      >
        <AlertCircle class="mx-auto h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
        <p class="mt-3 text-sm font-medium text-red-900 dark:text-red-200">Unable to load this photocard.</p>
        <p class="mt-1 text-sm text-red-700/90 dark:text-red-300/90">{{ error }}</p>
        <Button variant="outline" class="mt-4 rounded-lg border-red-300 bg-white dark:border-red-800 dark:bg-zinc-900" as-child>
          <NuxtLink to="/browse">Back to browse</NuxtLink>
        </Button>
      </div>

      <!-- Product -->
      <div v-else-if="card" class="grid gap-6 lg:grid-cols-2 lg:gap-10 xl:gap-14">
        <!-- Left: image -->
        <div class="lg:sticky lg:top-20 lg:self-start">
          <div class="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-card shadow-sm dark:border-zinc-800 lg:max-w-none">
            <div class="relative aspect-square bg-zinc-100 dark:bg-zinc-900">
              <img
                :src="card.image"
                :alt="`${card.name} photocard`"
                class="h-full w-full object-contain"
              />
              <div v-if="card.is_in_promotion && card.discount_rate" class="absolute left-3 top-3">
                <span class="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
                  -{{ card.discount_rate }}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: details -->
        <div class="space-y-5">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em]" :class="groupAccent(card.group_name)">
                <span class="h-1.5 w-1.5 rounded-full" :class="groupDot(card.group_name)" />
                {{ card.group_name }}
              </span>
              <span v-if="card.card_type" class="rounded-md border border-zinc-200 bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground dark:border-zinc-800">
                {{ card.card_type }}
              </span>
            </div>

            <p class="mt-3 text-sm font-medium text-muted-foreground">{{ card.member_name }}</p>
            <h1 class="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
              {{ card.name }}
            </h1>
            <p v-if="card.release_name" class="mt-2 text-sm text-muted-foreground">
              {{ card.release_name }}
            </p>
          </div>

          <!-- Price -->
          <div class="rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-800 sm:p-5">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Current price</p>
                <template v-if="effectivePrice > 0">
                  <p class="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
                    Rp {{ formatIDR(effectivePrice, rate) }}
                  </p>
                  <p class="mt-1 text-sm tabular-nums text-muted-foreground">
                    {{ formatUSD(effectivePrice) }}
                    <span v-if="card.is_in_promotion && card.price > 0" class="ml-1.5 line-through">
                      {{ formatUSD(card.price) }}
                    </span>
                  </p>
                </template>
                <p v-else class="mt-1.5 text-lg font-medium text-muted-foreground">Tidak tersedia</p>
              </div>
              <p class="text-xs text-muted-foreground">Source · Pocamarket</p>
            </div>

            <div class="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-row">
              <Button
                variant="outline"
                class="h-11 w-full gap-2 rounded-lg sm:h-10 sm:flex-1"
                as-child
              >
                <a href="https://pocamarket.com" target="_blank" rel="noopener noreferrer">
                  View on Pocamarket
                  <ExternalLink class="h-4 w-4" />
                </a>
              </Button>
              <Button
                variant="outline"
                class="h-11 w-full gap-2 rounded-lg sm:h-10 sm:flex-1"
                :class="isWishlisted ? 'border-rose-300 text-rose-600 dark:border-rose-800 dark:text-rose-400' : ''"
                :aria-pressed="isWishlisted"
                @click="handleWishlistToggle"
              >
                <Heart class="h-4 w-4" :fill="isWishlisted ? 'currentColor' : 'none'" />
                {{ isWishlisted ? 'Wishlisted' : 'Wishlist' }}
              </Button>
            </div>

            <Button class="mt-2 h-11 w-full gap-2 rounded-lg sm:h-10" @click="showAddDialog = true">
              <Tag class="h-4 w-4" />
              Add to Collection
              <span
                v-if="collectionItem"
                class="ml-1 rounded-md bg-background/20 px-1.5 py-0.5 text-[10px] font-medium uppercase"
              >
                {{ collectionItem.status }}
              </span>
            </Button>
          </div>

          <!-- Trend -->
          <div v-if="history.length >= 2" class="rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-800 sm:p-5">
            <p class="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Price trend</p>
            <div class="mt-2 flex items-center gap-2.5">
              <TrendingUp v-if="getPriceTrend() === 'up'" class="h-5 w-5 text-red-500" aria-hidden="true" />
              <TrendingDown v-else-if="getPriceTrend() === 'down'" class="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <Minus v-else class="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <span
                class="text-base font-semibold tabular-nums"
                :class="getPriceChange() > 0 ? 'text-red-500' : getPriceChange() < 0 ? 'text-emerald-600' : 'text-muted-foreground'"
              >
                {{ getPriceChange() > 0 ? '+' : '' }}${{ getPriceChange().toFixed(2) }}
              </span>
              <span class="text-xs text-muted-foreground">since last snapshot</span>
            </div>
          </div>

          <!-- Price history -->
          <div class="rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-800 sm:p-5">
            <h2 class="text-sm font-semibold text-foreground">Price History</h2>

            <div v-if="history.length === 0" class="mt-3 rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center dark:border-zinc-700">
              <Clock class="mx-auto h-6 w-6 text-zinc-400" aria-hidden="true" />
              <p class="mt-2 text-sm text-muted-foreground">
                Price history isn't available for this card yet.
              </p>
            </div>

            <template v-else>
              <div v-if="chartData" class="mt-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/60">
                <div class="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{{ chartData.labels.first }}</span>
                  <span class="flex items-center gap-3">
                    <span class="text-emerald-600 dark:text-emerald-400">Low: ${{ chartData.min.toFixed(2) }}</span>
                    <span class="text-red-600 dark:text-red-400">High: ${{ chartData.max.toFixed(2) }}</span>
                  </span>
                  <span>{{ chartData.labels.last }}</span>
                </div>
                <svg viewBox="0 0 600 160" class="w-full" preserveAspectRatio="none" style="height: 140px" role="img" aria-label="Price history chart">
                  <defs>
                    <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="currentColor" stop-opacity="0.15" />
                      <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
                    </linearGradient>
                  </defs>
                  <path :d="chartData.areaPath" fill="url(#chartFill)" class="text-zinc-400 dark:text-zinc-500" />
                  <path
                    :d="chartData.path"
                    fill="none"
                    class="text-zinc-700 dark:text-zinc-300"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <circle
                    v-for="(p, i) in chartData.points"
                    :key="i"
                    :cx="p.x"
                    :cy="p.y"
                    r="3.5"
                    fill="white"
                    class="text-zinc-700 dark:text-zinc-300"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <title>${{ p.price }} — {{ formatDate(p.date) }}</title>
                  </circle>
                </svg>
              </div>

              <ul class="mt-3 space-y-2">
                <li
                  v-for="entry in history.slice(0, 8)"
                  :key="entry.id"
                  class="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900/60"
                >
                  <span class="text-sm font-medium tabular-nums text-foreground">${{ entry.price }}</span>
                  <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock class="h-3 w-3" aria-hidden="true" />
                    {{ formatDate(entry.recorded_at) }}
                  </span>
                </li>
              </ul>
            </template>
          </div>
        </div>
      </div>

      <!-- Add Dialog -->
      <Dialog v-model:open="showAddDialog">
        <DialogContent class="max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader class="mb-1">
            <DialogTitle class="text-left text-lg">Add to Collection</DialogTitle>
            <DialogDescription class="text-left text-sm text-muted-foreground">
              Save this photocard to your wishlist or owned list.
            </DialogDescription>
          </DialogHeader>

          <div class="space-y-5">
            <div>
              <Label class="mb-2.5 block text-sm font-medium text-foreground">Status</Label>
              <div class="grid grid-cols-2 gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  class="gap-2 rounded-lg py-2.5"
                  :class="addToStatus === 'wishlist' ? 'border-foreground bg-zinc-100 text-foreground dark:bg-zinc-800' : ''"
                  :aria-pressed="addToStatus === 'wishlist'"
                  @click="addToStatus = 'wishlist'"
                >
                  <Heart class="h-4 w-4" /> Wishlist
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  class="gap-2 rounded-lg py-2.5"
                  :class="addToStatus === 'owned' ? 'border-foreground bg-zinc-100 text-foreground dark:bg-zinc-800' : ''"
                  :aria-pressed="addToStatus === 'owned'"
                  @click="addToStatus = 'owned'"
                >
                  <Package class="h-4 w-4" /> Owned
                </Button>
              </div>
            </div>

            <div v-if="addToStatus === 'owned'">
              <Label for="bought-price" class="mb-2 block text-sm font-medium text-foreground">Bought Price (USD)</Label>
              <Input
                id="bought-price"
                v-model="boughtPrice"
                type="number"
                step="0.01"
                placeholder="Optional"
                class="rounded-lg"
              />
            </div>

            <DialogFooter class="gap-2.5 sm:justify-end">
              <Button type="button" variant="outline" class="flex-1 rounded-lg sm:flex-none" @click="showAddDialog = false">
                Cancel
              </Button>
              <Button type="button" class="flex-1 gap-2 rounded-lg sm:flex-none" :disabled="adding" @click="handleAddToCollection">
                <Check class="h-4 w-4" /> {{ adding ? 'Adding...' : 'Add' }}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </main>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
