<script setup lang="ts">
import {
  ChevronLeft, ChevronRight, Search,
  SlidersHorizontal, X, ArrowUpDown, RotateCcw, AlertCircle, Check
} from 'lucide-vue-next'
import {
  GROUPS, MEMBERS, CARD_TYPES, SORT_OPTIONS,
  groupDot,
} from '@/lib/catalog'

useHead({ title: 'Browse — HIBIKISHOP PC' })

const route = useRoute()
const router = useRouter()

const selectedGroup = ref<string>(String(route.query.group || 'IVE'))
if (!GROUPS.includes(selectedGroup.value as any)) selectedGroup.value = 'IVE'

const initialMember = String(route.query.member || '')
const initialCardType = String(route.query.card_type || '')
const initialRelease = String(route.query.release || '')
const initialStore = String(route.query.store || '')

const selectedMember = ref<string | null>(initialMember || null)
const selectedCardType = ref<string | null>(initialCardType || null)
const selectedRelease = ref<string | null>(initialRelease || null)
const selectedStore = ref<string | null>(initialStore || null)
const selectedSort = ref('popular')
const searchQuery = ref(String(route.query.q || ''))
const minPriceIDR = ref<string>('')
const maxPriceIDR = ref<string>('')
const showFilters = ref(false)
const mobileFiltersOpen = ref(false)
const currentPage = ref(1)
const pageSize = 20

const cardTypeChips = computed(() => ['All', ...CARD_TYPES])

const cards = ref<any[]>([])
const loading = ref(true)
const loadError = ref(false)
const total = ref(0)
const totalPages = ref(0)
const exchangeRates = ref<any>(null)
const storeCounts = ref<{ store: string, count: number, by_group: Record<string, number> }[]>([])

/** Stores are counted for the selected group so the number matches the results. */
const stores = computed(() => {
  const group = selectedGroup.value
  return storeCounts.value
    .map(entry => ({ store: entry.store, count: entry.by_group?.[group] || 0 }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count)
})

const { fetchCollection, wishlistIds, toggleWishlist } = useCollection()

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedMember.value) count++
  if (selectedCardType.value) count++
  if (selectedRelease.value) count++
  if (selectedStore.value) count++
  if (selectedSort.value !== 'popular') count++
  if (minPriceIDR.value) count++
  if (maxPriceIDR.value) count++
  if (searchQuery.value) count++
  return count
})

onMounted(() => {
  loadCards()
  loadExchangeRates()
  loadStores()
  fetchCollection()
})

async function loadStores() {
  try {
    const response = await $fetch<any>('/api/stores')
    if (response?.success) storeCounts.value = response.data || []
  } catch (e) {
    console.error('Failed to load stores:', e)
  }
}

async function loadExchangeRates() {
  try {
    const response = await $fetch<any>('/api/exchangerate')
    if (response.success) {
      exchangeRates.value = response.data
      if (minPriceIDR.value || maxPriceIDR.value) loadCards()
    }
  } catch (e) {
    console.error('Failed to load exchange rates:', e)
  }
}

const rate = computed(() => exchangeRates.value?.usd?.rate || 17800)

let suppressStoreWatch = false

watch(selectedGroup, () => {
  selectedMember.value = null
  selectedCardType.value = null
  selectedRelease.value = null
  currentPage.value = 1

  // Drop a store filter that has no cards in the newly selected group.
  if (selectedStore.value) {
    const available = storeCounts.value.find(entry => entry.store === selectedStore.value)
    if (!available?.by_group?.[selectedGroup.value]) {
      suppressStoreWatch = true
      selectedStore.value = null
      nextTick(() => { suppressStoreWatch = false })
    }
  }

  syncFilterQuery()
  loadCards()
})

let priceTimer: ReturnType<typeof setTimeout> | null = null
watch([minPriceIDR, maxPriceIDR], () => {
  if (priceTimer) clearTimeout(priceTimer)
  priceTimer = setTimeout(() => {
    currentPage.value = 1
    loadCards()
  }, 400)
})

watch([selectedMember, selectedCardType, selectedRelease, selectedStore, selectedSort], () => {
  if (suppressStoreWatch) return
  currentPage.value = 1
  syncFilterQuery()
  loadCards()
})

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    syncSearchQuery()
    loadCards()
  }, 400)
})

watch(
  () => route.query.group,
  (value) => {
    const next = String(value || '')
    if (next && GROUPS.includes(next as any) && next !== selectedGroup.value) {
      selectedGroup.value = next
    }
  },
)

watch(
  () => route.query.q,
  (value) => {
    const next = String(value || '')
    if (next !== searchQuery.value) searchQuery.value = next
  },
)

watch(
  () => route.query.card_type,
  (value) => {
    const next = String(value || '')
    if (next !== (selectedCardType.value || '')) selectedCardType.value = next || null
  },
)

watch(
  () => route.query.release,
  (value) => {
    const next = String(value || '')
    if (next !== (selectedRelease.value || '')) selectedRelease.value = next || null
  },
)

watch(
  () => route.query.member,
  (value) => {
    const next = String(value || '')
    if (next !== (selectedMember.value || '')) selectedMember.value = next || null
  },
)

watch(
  () => route.query.store,
  (value) => {
    const next = String(value || '')
    if (next !== (selectedStore.value || '')) selectedStore.value = next || null
  },
)

function syncFilterQuery() {
  const query: Record<string, any> = { ...route.query, group: selectedGroup.value }
  const q = searchQuery.value.trim()
  if (q) query.q = q
  else delete query.q
  if (selectedMember.value) query.member = selectedMember.value
  else delete query.member
  if (selectedCardType.value) query.card_type = selectedCardType.value
  else delete query.card_type
  if (selectedRelease.value) query.release = selectedRelease.value
  else delete query.release
  if (selectedStore.value) query.store = selectedStore.value
  else delete query.store
  router.replace({ query })
}

function syncSearchQuery() {
  syncFilterQuery()
}

function idrToUSD(idr: number): number {
  const r = exchangeRates.value?.usd?.rate
  return r ? idr / r : idr / 17800
}

async function loadCards() {
  loading.value = true
  loadError.value = false
  try {
    const params = new URLSearchParams({
      group: selectedGroup.value,
      page: String(currentPage.value),
      limit: String(pageSize),
      sort: selectedSort.value,
    })
    if (selectedMember.value) params.set('member', selectedMember.value)
    if (selectedCardType.value) params.set('card_type', selectedCardType.value)
    if (selectedRelease.value) params.set('release', selectedRelease.value)
    if (selectedStore.value) params.set('store', selectedStore.value)
    if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim())
    if (minPriceIDR.value) params.set('min_price', idrToUSD(Number(minPriceIDR.value)).toFixed(4))
    if (maxPriceIDR.value) params.set('max_price', idrToUSD(Number(maxPriceIDR.value)).toFixed(4))
    const response = await $fetch<any>(`/api/cards?${params}`)
    if (response.success) {
      cards.value = response.data
      total.value = response.pagination.total
      totalPages.value = response.pagination.totalPages
    }
  } catch (e) {
    console.error('Failed to load cards:', e)
    loadError.value = true
    cards.value = []
  } finally {
    loading.value = false
  }
}

function clearFilters() {
  selectedMember.value = null
  selectedCardType.value = null
  selectedRelease.value = null
  selectedStore.value = null
  selectedSort.value = 'popular'
  searchQuery.value = ''
  minPriceIDR.value = ''
  maxPriceIDR.value = ''
}

function goToPage(page: number) {
  currentPage.value = page
  loadCards()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function nextPage() { if (currentPage.value < totalPages.value) goToPage(currentPage.value + 1) }
function prevPage() { if (currentPage.value > 1) goToPage(currentPage.value - 1) }

async function onWishlist(id: number | string) {
  await toggleWishlist(Number(id))
}

const visiblePages = computed(() => {
  const pages: (number | string)[] = []
  const t = totalPages.value
  const c = currentPage.value
  if (t <= 7) {
    for (let i = 1; i <= t; i++) pages.push(i)
  } else {
    pages.push(1)
    if (c > 3) pages.push('...')
    for (let i = Math.max(2, c - 1); i <= Math.min(t - 1, c + 1); i++) pages.push(i)
    if (c < t - 2) pages.push('...')
    pages.push(t)
  }
  return pages
})
</script>

<template>
  <div class="min-h-screen overflow-x-clip bg-background">
    <AppHeader active="browse" />

    <!-- Exchange Rate Bar -->
    <div v-if="exchangeRates" class="border-b border-zinc-200 bg-card dark:border-zinc-800">
      <div class="page-shell flex flex-col items-center justify-center gap-0.5 py-2 text-xs sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-1">
        <span class="max-w-full truncate text-center text-muted-foreground sm:max-w-none">
          Kurs BI · 1 USD = <span class="font-medium tabular-nums text-foreground">{{ Math.round(exchangeRates.usd?.rate)?.toLocaleString('id-ID') }}</span> IDR
        </span>
        <span class="hidden text-zinc-300 dark:text-zinc-700 sm:inline" aria-hidden="true">|</span>
        <span class="max-w-full truncate text-center text-muted-foreground sm:max-w-none">
          1 MYR = <span class="font-medium tabular-nums text-foreground">{{ Math.round(exchangeRates.myr?.rate)?.toLocaleString('id-ID') }}</span> IDR
        </span>
        <span class="hidden text-muted-foreground sm:inline">{{ exchangeRates.date }}</span>
      </div>
    </div>

    <main class="page-shell min-w-0 py-6 sm:py-8">
      <div class="mb-5 min-w-0 sm:mb-6">
        <p class="eyebrow">Catalog</p>
        <h1 class="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Photocard Catalog</h1>
        <p class="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          <template v-if="loading">Loading…</template>
          <template v-else><span class="font-medium tabular-nums text-foreground">{{ total.toLocaleString() }}</span> cards</template>
          · Identify album PCs, POBs, lucky draws and more. Market reference data from
          <a href="https://pocamarket.com" target="_blank" rel="noopener noreferrer" class="font-medium text-foreground underline-offset-2 hover:underline">POCAMARKET</a>.
        </p>
      </div>

      <div class="grid min-w-0 gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
        <!-- Desktop sidebar filters -->
        <aside class="hidden lg:block">
          <div class="sticky top-20 space-y-5 rounded-xl border border-border bg-card p-4">
            <div>
              <p class="pc-meta-label mb-2">Group</p>
              <div class="flex flex-col gap-0.5">
                <button
                  v-for="group in GROUPS"
                  :key="group"
                  type="button"
                  class="filter-link"
                  :class="selectedGroup === group ? 'filter-link-active' : ''"
                  :aria-pressed="selectedGroup === group"
                  @click="selectedGroup = group"
                >
                  <span class="flex min-w-0 items-center gap-2">
                    <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="groupDot(group)" />
                    <span class="truncate">{{ group }}</span>
                  </span>
                </button>
              </div>
            </div>

            <Separator />

            <div>
              <p class="pc-meta-label mb-2">Card Type</p>
              <div class="flex flex-col gap-0.5">
                <button
                  type="button"
                  class="filter-link"
                  :class="!selectedCardType ? 'filter-link-active' : ''"
                  :aria-pressed="!selectedCardType"
                  @click="selectedCardType = null"
                >
                  <span class="truncate">All types</span>
                  <Check v-if="!selectedCardType" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
                <button
                  v-for="t in CARD_TYPES"
                  :key="t"
                  type="button"
                  class="filter-link"
                  :class="selectedCardType === t ? 'filter-link-active' : ''"
                  :aria-pressed="selectedCardType === t"
                  @click="selectedCardType = t"
                >
                  <span class="truncate">{{ t }}</span>
                  <Check v-if="selectedCardType === t" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
              </div>
            </div>

            <Separator />

            <div>
              <p class="pc-meta-label mb-2">Member</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="chip"
                  :class="!selectedMember ? 'chip-active' : ''"
                  :aria-pressed="!selectedMember"
                  @click="selectedMember = null"
                >All</button>
                <button
                  v-for="m in MEMBERS[selectedGroup] || []"
                  :key="m"
                  type="button"
                  class="chip"
                  :class="selectedMember === m ? 'chip-active' : ''"
                  :aria-pressed="selectedMember === m"
                  @click="selectedMember = m"
                >{{ m }}</button>
              </div>
            </div>

            <Separator />

            <div>
              <p class="pc-meta-label mb-2">Store</p>
              <div class="flex flex-col gap-0.5">
                <button
                  type="button"
                  class="filter-link"
                  :class="!selectedStore ? 'filter-link-active' : ''"
                  :aria-pressed="!selectedStore"
                  @click="selectedStore = null"
                >
                  <span class="truncate">All stores</span>
                  <Check v-if="!selectedStore" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
                <button
                  v-for="s in stores"
                  :key="s.store"
                  type="button"
                  class="filter-link"
                  :class="selectedStore === s.store ? 'filter-link-active' : ''"
                  :aria-pressed="selectedStore === s.store"
                  @click="selectedStore = s.store"
                >
                  <span class="truncate">{{ s.store }}</span>
                  <span class="ml-auto flex shrink-0 items-center gap-1.5">
                    <span class="text-[11px] tabular-nums text-muted-foreground">{{ s.count.toLocaleString() }}</span>
                    <Check v-if="selectedStore === s.store" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </span>
                </button>
                <p v-if="stores.length === 0" class="mt-1 text-xs text-muted-foreground">No store data yet.</p>
              </div>
            </div>

            <Separator />

            <div>
              <p class="pc-meta-label mb-2">Price (IDR)</p>
              <div class="flex flex-col gap-2">
                <Input
                  v-model="minPriceIDR"
                  type="number"
                  inputmode="numeric"
                  placeholder="Min"
                  class="h-9 rounded-lg"
                  aria-label="Minimum price in IDR"
                />
                <Input
                  v-model="maxPriceIDR"
                  type="number"
                  inputmode="numeric"
                  placeholder="Max"
                  class="h-9 rounded-lg"
                  aria-label="Maximum price in IDR"
                />
              </div>
            </div>

            <Button
              v-if="activeFilterCount > 0"
              variant="outline"
              size="sm"
              class="w-full gap-1.5 rounded-lg"
              @click="clearFilters"
            >
              <RotateCcw class="h-3.5 w-3.5" />
              Clear filters
            </Button>
          </div>
        </aside>

        <!-- Content -->
        <div class="min-w-0 overflow-x-clip">
          <!-- Toolbar -->
          <div class="mb-4 min-w-0 space-y-3">
            <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div class="relative w-full min-w-0 sm:flex-1 md:max-w-sm">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  v-model="searchQuery"
                  type="search"
                  placeholder="Search member, group, album, card type, store..."
                  class="h-10 rounded-lg pl-9"
                  aria-label="Search photocards"
                />
              </div>

              <div class="flex w-full min-w-0 items-center gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-10 min-w-0 flex-1 gap-1.5 rounded-lg sm:flex-none lg:hidden"
                  @click="mobileFiltersOpen = true"
                >
                  <SlidersHorizontal class="h-4 w-4 shrink-0" />
                  <span class="truncate">Filters</span>
                  <span
                    v-if="activeFilterCount > 0"
                    class="ml-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background"
                  >{{ activeFilterCount }}</span>
                </Button>

                <Select v-model="selectedSort">
                  <SelectTrigger
                    class="h-10 w-full min-w-0 flex-1 gap-1.5 rounded-lg sm:w-auto sm:min-w-[8.5rem] sm:flex-none md:min-w-[9.5rem]"
                    aria-label="Sort"
                  >
                    <ArrowUpDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <SelectValue class="min-w-0 truncate" />
                  </SelectTrigger>
                  <SelectContent class="min-w-[12rem] max-w-[calc(100vw-2rem)]">
                    <SelectItem v-for="opt in SORT_OPTIONS" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <!-- Card type quick filters -->
            <div class="-mx-1 min-w-0 overflow-x-auto px-1 pb-0.5">
              <div class="flex w-max min-w-full items-center gap-1.5" role="group" aria-label="Filter by card type">
                <button
                  v-for="t in cardTypeChips"
                  :key="t"
                  type="button"
                  class="chip"
                  :class="(t === 'All' ? !selectedCardType : selectedCardType === t) ? 'chip-active' : ''"
                  :aria-pressed="t === 'All' ? !selectedCardType : selectedCardType === t"
                  @click="selectedCardType = t === 'All' ? null : t"
                >
                  {{ t === 'All' ? 'All types' : t }}
                </button>
              </div>
            </div>

            <!-- Group pills + active chips -->
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <button
                v-for="group in GROUPS"
                :key="group"
                type="button"
                class="chip max-w-full truncate"
                :class="selectedGroup === group ? 'chip-active' : ''"
                :aria-pressed="selectedGroup === group"
                @click="selectedGroup = group"
              >
                <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="groupDot(group)" aria-hidden="true" />
                {{ group }}
              </button>

              <span
                v-if="selectedMember"
                class="chip max-w-full"
              >
                <span class="truncate">{{ selectedMember }}</span>
                <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" :aria-label="`Clear member ${selectedMember}`" @click="selectedMember = null">
                  <X class="h-3 w-3" />
                </button>
              </span>
              <span
                v-if="selectedCardType"
                class="chip max-w-full"
              >
                <span class="truncate">{{ selectedCardType }}</span>
                <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" :aria-label="`Clear card type ${selectedCardType}`" @click="selectedCardType = null">
                  <X class="h-3 w-3" />
                </button>
              </span>
              <span
                v-if="selectedRelease"
                class="chip max-w-full"
              >
                <span class="truncate">{{ selectedRelease }}</span>
                <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Clear release filter" @click="selectedRelease = null">
                  <X class="h-3 w-3" />
                </button>
              </span>
              <span
                v-if="selectedStore"
                class="chip max-w-full"
              >
                <span class="truncate">{{ selectedStore }}</span>
                <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" :aria-label="`Clear store ${selectedStore}`" @click="selectedStore = null">
                  <X class="h-3 w-3" />
                </button>
              </span>
              <span
                v-if="minPriceIDR || maxPriceIDR"
                class="chip max-w-full min-w-0"
              >
                <span class="truncate">Rp {{ Number(minPriceIDR || 0).toLocaleString('id-ID') }} – Rp {{ Number(maxPriceIDR || 0).toLocaleString('id-ID') }}</span>
                <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Clear price filter" @click="minPriceIDR = ''; maxPriceIDR = ''">
                  <X class="h-3 w-3" />
                </button>
              </span>

              <button
                v-if="activeFilterCount > 0"
                type="button"
                class="shrink-0 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                @click="clearFilters"
              >
                Clear all
              </button>
            </div>
          </div>

          <!-- Error -->
          <div
            v-if="loadError && !loading"
            class="mb-4 flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/40"
            role="alert"
          >
            <div class="flex items-start gap-2.5">
              <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <div>
                <p class="text-sm font-medium text-red-900 dark:text-red-200">Unable to load photocards.</p>
                <p class="text-sm text-red-700/90 dark:text-red-300/90">Please try again.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" class="rounded-lg border-red-300 bg-white dark:border-red-800 dark:bg-zinc-900" @click="loadCards">
              Retry
            </Button>
          </div>

          <!-- Loading skeletons -->
          <div v-if="loading" class="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            <div v-for="i in pageSize" :key="i" class="pc-skeleton min-w-0">
              <div class="skeleton-block aspect-square rounded-none" />
              <div class="space-y-2.5 p-3">
                <div class="skeleton-block h-3 w-1/3" />
                <div class="skeleton-block h-3.5 w-full" />
                <div class="skeleton-block h-3.5 w-2/3" />
                <div class="skeleton-block h-4 w-1/2" />
              </div>
            </div>
          </div>

          <!-- Empty -->
          <div
            v-else-if="cards.length === 0 && !loadError"
            class="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700"
          >
            <p class="eyebrow">No results</p>
            <p class="mt-3 text-sm font-medium text-foreground">No photocards match these filters.</p>
            <p class="mt-1 text-sm text-muted-foreground">Try another group, member, or card type.</p>
            <Button variant="outline" class="mt-4 rounded-lg" @click="clearFilters">Clear filters</Button>
          </div>

          <!-- Cards -->
          <div
            v-else
            class="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          >
            <PhotocardCard
              v-for="card in cards"
              :key="card.id"
              class="min-w-0"
              :card="card"
              :rate="rate"
              show-wishlist
              :wishlisted="wishlistIds.has(card.id)"
              @wishlist="onWishlist"
            />
          </div>

          <!-- Pagination -->
          <div v-if="!loading && totalPages > 1 && cards.length > 0" class="mt-8 min-w-0 sm:mt-10">
            <p class="mb-3 text-center text-xs text-muted-foreground">
              Page <span class="font-medium tabular-nums text-foreground">{{ currentPage.toLocaleString() }}</span>
              of <span class="font-medium tabular-nums text-foreground">{{ totalPages.toLocaleString() }}</span>
              <span class="hidden sm:inline"> · {{ total.toLocaleString() }} cards</span>
            </p>

            <!-- Mobile: Prev / page indicator / Next only -->
            <div class="flex min-w-0 items-center justify-between gap-2 sm:hidden">
              <Button
                variant="outline"
                class="h-11 min-w-0 flex-1 gap-1 rounded-lg"
                :disabled="currentPage === 1"
                @click="prevPage"
              >
                <ChevronLeft class="h-4 w-4 shrink-0" />
                <span class="truncate">Prev</span>
              </Button>
              <span class="shrink-0 whitespace-nowrap px-1 text-xs font-medium tabular-nums text-muted-foreground">
                {{ currentPage }} / {{ totalPages }}
              </span>
              <Button
                variant="outline"
                class="h-11 min-w-0 flex-1 gap-1 rounded-lg"
                :disabled="currentPage === totalPages"
                @click="nextPage"
              >
                <span class="truncate">Next</span>
                <ChevronRight class="h-4 w-4 shrink-0" />
              </Button>
            </div>

            <!-- Desktop -->
            <div class="hidden min-w-0 flex-wrap items-center justify-center gap-2 sm:flex">
              <Button variant="outline" size="icon-sm" class="rounded-lg" :disabled="currentPage === 1" @click="prevPage">
                <ChevronLeft class="h-4 w-4" />
              </Button>
              <template v-for="(page, index) in visiblePages" :key="index">
                <span v-if="page === '...'" class="px-1.5 text-muted-foreground">...</span>
                <Button
                  v-else
                  size="sm"
                  :variant="page === currentPage ? 'default' : 'outline'"
                  class="min-w-9 rounded-lg px-3"
                  @click="goToPage(page as number)"
                >{{ page }}</Button>
              </template>
              <Button variant="outline" size="icon-sm" class="rounded-lg" :disabled="currentPage === totalPages" @click="nextPage">
                <ChevronRight class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Mobile filter sheet -->
    <Sheet v-model:open="mobileFiltersOpen">
      <SheetContent
        side="bottom"
        class="max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-2xl border-zinc-200 p-0 dark:border-zinc-800 sm:inset-x-auto sm:right-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
      >
        <SheetHeader class="relative border-b border-zinc-200 px-4 py-4 pr-12 text-left dark:border-zinc-800">
          <SheetTitle class="text-base font-semibold">Filters</SheetTitle>
          <SheetDescription class="text-sm text-muted-foreground">
            Narrow results by member, card type, and price.
          </SheetDescription>
        </SheetHeader>

        <div class="space-y-5 px-4 py-4">
          <div>
            <p class="mb-2 pc-meta-label">Group</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="group in GROUPS"
                :key="group"
                type="button"
                class="chip"
                :class="selectedGroup === group ? 'chip-active' : ''"
                @click="selectedGroup = group"
              >{{ group }}</button>
            </div>
          </div>

          <div>
            <p class="mb-2 pc-meta-label">Card Type</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class="chip"
                :class="!selectedCardType ? 'chip-active' : ''"
                @click="selectedCardType = null"
              >All types</button>
              <button
                v-for="t in CARD_TYPES"
                :key="t"
                type="button"
                class="chip"
                :class="selectedCardType === t ? 'chip-active' : ''"
                @click="selectedCardType = t"
              >{{ t }}</button>
            </div>
          </div>

          <div>
            <p class="mb-2 pc-meta-label">Member</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class="chip"
                :class="!selectedMember ? 'chip-active' : ''"
                @click="selectedMember = null"
              >All</button>
              <button
                v-for="m in MEMBERS[selectedGroup] || []"
                :key="m"
                type="button"
                class="chip"
                :class="selectedMember === m ? 'chip-active' : ''"
                @click="selectedMember = m"
              >{{ m }}</button>
            </div>
          </div>

          <div v-if="stores.length > 0">
            <p class="mb-2 pc-meta-label">Store</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class="chip"
                :class="!selectedStore ? 'chip-active' : ''"
                @click="selectedStore = null"
              >All stores</button>
              <button
                v-for="s in stores"
                :key="s.store"
                type="button"
                class="chip"
                :class="selectedStore === s.store ? 'chip-active' : ''"
                @click="selectedStore = s.store"
              >{{ s.store }}</button>
            </div>
          </div>

          <div>
            <p class="mb-2 pc-meta-label">Price (IDR)</p>
            <div class="flex gap-2">
              <Input v-model="minPriceIDR" type="number" inputmode="numeric" placeholder="Min" class="h-10 rounded-lg" aria-label="Minimum price" />
              <Input v-model="maxPriceIDR" type="number" inputmode="numeric" placeholder="Max" class="h-10 rounded-lg" aria-label="Maximum price" />
            </div>
          </div>
        </div>

        <SheetFooter class="gap-2 border-t border-zinc-200 px-4 py-4 dark:border-zinc-800 sm:flex-row">
          <Button variant="outline" class="flex-1 rounded-lg" @click="clearFilters">Clear</Button>
          <Button class="flex-1 rounded-lg" @click="mobileFiltersOpen = false">Show results</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
