<script setup lang="ts">
import {
  ChevronLeft, ChevronRight, Search,
  SlidersHorizontal, X, ArrowUpDown, RotateCcw, AlertCircle
} from 'lucide-vue-next'
import {
  GROUPS, MEMBERS, CARD_TYPES, SORT_OPTIONS,
  groupAccentActive, groupDot,
} from '@/lib/catalog'

useHead({ title: 'Browse — HIBIKISHOP PC' })

const route = useRoute()
const router = useRouter()

const selectedGroup = ref<string>(String(route.query.group || 'IVE'))
if (!GROUPS.includes(selectedGroup.value as any)) selectedGroup.value = 'IVE'

const selectedMember = ref<string | null>(null)
const selectedCardType = ref<string | null>(null)
const selectedSort = ref('popular')
const searchQuery = ref(String(route.query.q || ''))
const minPriceIDR = ref<string>('')
const maxPriceIDR = ref<string>('')
const showFilters = ref(false)
const mobileFiltersOpen = ref(false)
const currentPage = ref(1)
const pageSize = 20

const cards = ref<any[]>([])
const loading = ref(true)
const loadError = ref(false)
const total = ref(0)
const totalPages = ref(0)
const exchangeRates = ref<any>(null)

const { fetchCollection, wishlistIds, toggleWishlist } = useCollection()

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedMember.value) count++
  if (selectedCardType.value) count++
  if (selectedSort.value !== 'popular') count++
  if (minPriceIDR.value) count++
  if (maxPriceIDR.value) count++
  if (searchQuery.value) count++
  return count
})

onMounted(() => {
  loadCards()
  loadExchangeRates()
  fetchCollection()
})

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

watch(selectedGroup, () => {
  selectedMember.value = null
  selectedCardType.value = null
  currentPage.value = 1
  syncGroupQuery()
  loadCards()
})

watch([selectedMember, selectedCardType, selectedSort, minPriceIDR, maxPriceIDR], () => {
  currentPage.value = 1
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

function syncGroupQuery() {
  router.replace({ query: { ...route.query, group: selectedGroup.value } })
}

function syncSearchQuery() {
  const q = searchQuery.value.trim()
  const query: Record<string, any> = { ...route.query, group: selectedGroup.value }
  if (q) query.q = q
  else delete query.q
  router.replace({ query })
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

const mobilePages = computed(() => {
  const t = totalPages.value
  const c = currentPage.value
  if (t <= 5) {
    return Array.from({ length: t }, (_, i) => i + 1)
  }
  const pages: (number | string)[] = []
  const start = Math.max(1, Math.min(c - 1, t - 3))
  const end = Math.min(t, start + 3)
  if (start > 1) {
    pages.push(1)
    if (start > 2) pages.push('...')
  }
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < t) {
    if (end < t - 1) pages.push('...')
    pages.push(t)
  }
  return pages
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader active="browse" />

    <!-- Exchange Rate Bar -->
    <div v-if="exchangeRates" class="border-b border-zinc-200 bg-card dark:border-zinc-800">
      <div class="page-shell flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-2 text-xs">
        <span class="text-muted-foreground">
          Kurs BI · 1 USD = <span class="font-medium tabular-nums text-foreground">{{ Math.round(exchangeRates.usd?.rate)?.toLocaleString('id-ID') }}</span> IDR
        </span>
        <span class="text-zinc-300 dark:text-zinc-700" aria-hidden="true">|</span>
        <span class="text-muted-foreground">
          1 MYR = <span class="font-medium tabular-nums text-foreground">{{ Math.round(exchangeRates.myr?.rate)?.toLocaleString('id-ID') }}</span> IDR
        </span>
        <span class="hidden text-muted-foreground sm:inline">{{ exchangeRates.date }}</span>
      </div>
    </div>

    <main class="page-shell py-6 sm:py-8">
      <div class="mb-5 sm:mb-6">
        <p class="eyebrow">Catalog</p>
        <h1 class="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Browse Photocards</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          <template v-if="loading">Loading...</template>
          <template v-else>{{ total.toLocaleString() }} cards</template>
          · Data based on
          <a href="https://pocamarket.com" target="_blank" rel="noopener noreferrer" class="font-medium text-foreground underline-offset-2 hover:underline">POCAMARKET</a>
        </p>
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
        <!-- Desktop sidebar filters -->
        <aside class="hidden lg:block">
          <div class="sticky top-20 space-y-6 rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-800">
            <div>
              <p class="mb-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Group</p>
              <div class="flex flex-col gap-1">
                <button
                  v-for="group in GROUPS"
                  :key="group"
                  type="button"
                  class="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150"
                  :class="selectedGroup === group ? groupAccentActive(group) : 'text-muted-foreground hover:bg-zinc-50 hover:text-foreground dark:hover:bg-zinc-900'"
                  :aria-pressed="selectedGroup === group"
                  @click="selectedGroup = group"
                >
                  <span class="h-1.5 w-1.5 rounded-full" :class="groupDot(group)" />
                  {{ group }}
                </button>
              </div>
            </div>

            <Separator />

            <div>
              <p class="mb-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Member</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                  :class="!selectedMember ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-muted-foreground hover:border-zinc-300 hover:text-foreground dark:border-zinc-800'"
                  @click="selectedMember = null"
                >All</button>
                <button
                  v-for="m in MEMBERS[selectedGroup] || []"
                  :key="m"
                  type="button"
                  class="rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                  :class="selectedMember === m ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-muted-foreground hover:border-zinc-300 hover:text-foreground dark:border-zinc-800'"
                  @click="selectedMember = m"
                >{{ m }}</button>
              </div>
            </div>

            <Separator />

            <div>
              <p class="mb-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Card Type</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                  :class="!selectedCardType ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-muted-foreground hover:border-zinc-300 hover:text-foreground dark:border-zinc-800'"
                  @click="selectedCardType = null"
                >All</button>
                <button
                  v-for="t in CARD_TYPES"
                  :key="t"
                  type="button"
                  class="rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                  :class="selectedCardType === t ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-muted-foreground hover:border-zinc-300 hover:text-foreground dark:border-zinc-800'"
                  @click="selectedCardType = t"
                >{{ t }}</button>
              </div>
            </div>

            <Separator />

            <div>
              <p class="mb-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Price (IDR)</p>
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
        <div class="min-w-0">
          <!-- Toolbar -->
          <div class="mb-4 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <div class="relative min-w-0 flex-1 md:max-w-sm">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  v-model="searchQuery"
                  type="search"
                  placeholder="Search member, album, photocard..."
                  class="h-10 rounded-lg pl-9"
                  aria-label="Search photocards"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                class="gap-1.5 rounded-lg lg:hidden"
                @click="mobileFiltersOpen = true"
              >
                <SlidersHorizontal class="h-4 w-4" />
                Filters
                <span
                  v-if="activeFilterCount > 0"
                  class="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background"
                >{{ activeFilterCount }}</span>
              </Button>

              <Select v-model="selectedSort">
                <SelectTrigger class="h-10 w-auto min-w-[9.5rem] gap-2 rounded-lg" aria-label="Sort">
                  <ArrowUpDown class="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent class="min-w-[12rem]">
                  <SelectItem v-for="opt in SORT_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Group pills (mobile-visible primary) + active chips -->
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-for="group in GROUPS"
                :key="group"
                type="button"
                class="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150 sm:text-sm"
                :class="selectedGroup === group ? groupAccentActive(group) : 'border-zinc-200 bg-card text-muted-foreground hover:border-zinc-300 hover:text-foreground dark:border-zinc-800'"
                :aria-pressed="selectedGroup === group"
                @click="selectedGroup = group"
              >
                {{ group }}
              </button>

              <span
                v-if="selectedMember"
                class="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-card px-2 py-1 text-xs font-medium text-foreground dark:border-zinc-800"
              >
                {{ selectedMember }}
                <button type="button" class="text-muted-foreground hover:text-foreground" :aria-label="`Clear member ${selectedMember}`" @click="selectedMember = null">
                  <X class="h-3 w-3" />
                </button>
              </span>
              <span
                v-if="selectedCardType"
                class="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-card px-2 py-1 text-xs font-medium text-foreground dark:border-zinc-800"
              >
                {{ selectedCardType }}
                <button type="button" class="text-muted-foreground hover:text-foreground" :aria-label="`Clear card type ${selectedCardType}`" @click="selectedCardType = null">
                  <X class="h-3 w-3" />
                </button>
              </span>
              <span
                v-if="minPriceIDR || maxPriceIDR"
                class="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-card px-2 py-1 text-xs font-medium text-foreground dark:border-zinc-800"
              >
                Rp {{ Number(minPriceIDR || 0).toLocaleString('id-ID') }} – Rp {{ Number(maxPriceIDR || 0).toLocaleString('id-ID') }}
                <button type="button" class="text-muted-foreground hover:text-foreground" aria-label="Clear price filter" @click="minPriceIDR = ''; maxPriceIDR = ''">
                  <X class="h-3 w-3" />
                </button>
              </span>

              <button
                v-if="activeFilterCount > 0"
                type="button"
                class="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
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
          <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            <div v-for="i in pageSize" :key="i" class="pc-skeleton">
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
            <Search class="mx-auto h-8 w-8 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
            <p class="mt-3 text-sm font-medium text-foreground">No photocards found.</p>
            <p class="mt-1 text-sm text-muted-foreground">Try changing your filters or search query.</p>
            <Button variant="outline" class="mt-4 rounded-lg" @click="clearFilters">Clear filters</Button>
          </div>

          <!-- Cards -->
          <div
            v-else
            class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          >
            <PhotocardCard
              v-for="card in cards"
              :key="card.id"
              :card="card"
              :rate="rate"
              show-wishlist
              :wishlisted="wishlistIds.has(card.id)"
              @wishlist="onWishlist"
            />
          </div>

          <!-- Pagination -->
          <div v-if="!loading && totalPages > 1 && cards.length > 0" class="mt-8 sm:mt-10">
            <p class="mb-3 text-center text-xs text-muted-foreground">
              Page <span class="font-medium tabular-nums text-foreground">{{ currentPage.toLocaleString() }}</span>
              of <span class="font-medium tabular-nums text-foreground">{{ totalPages.toLocaleString() }}</span>
              <span class="hidden sm:inline"> · {{ total.toLocaleString() }} cards</span>
            </p>

            <!-- Mobile -->
            <div class="flex items-center gap-2 sm:hidden">
              <Button variant="outline" class="h-11 flex-1 gap-1 rounded-lg" :disabled="currentPage === 1" @click="prevPage">
                <ChevronLeft class="h-4 w-4" />
                Prev
              </Button>
              <div class="flex items-center gap-1">
                <template v-for="p in mobilePages" :key="'m-' + p">
                  <span v-if="p === '...'" class="px-0.5 text-sm text-muted-foreground">…</span>
                  <Button
                    v-else
                    size="sm"
                    :variant="p === currentPage ? 'default' : 'ghost'"
                    class="h-9 min-w-9 rounded-lg px-2"
                    @click="goToPage(p as number)"
                  >{{ p }}</Button>
                </template>
              </div>
              <Button variant="outline" class="h-11 flex-1 gap-1 rounded-lg" :disabled="currentPage === totalPages" @click="nextPage">
                Next
                <ChevronRight class="h-4 w-4" />
              </Button>
            </div>

            <!-- Desktop -->
            <div class="hidden items-center justify-center gap-2 sm:flex">
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
      <SheetContent side="bottom" class="max-h-[85vh] overflow-y-auto rounded-t-2xl p-0 sm:max-w-md sm:rounded-2xl sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
        <SheetHeader class="border-b border-zinc-200 px-4 py-4 text-left dark:border-zinc-800">
          <SheetTitle class="text-base font-semibold">Filters</SheetTitle>
          <SheetDescription class="text-sm text-muted-foreground">
            Narrow results by member, card type, and price.
          </SheetDescription>
        </SheetHeader>

        <div class="space-y-5 px-4 py-4">
          <div>
            <p class="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Group</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="group in GROUPS"
                :key="group"
                type="button"
                class="rounded-lg border px-3 py-1.5 text-sm font-medium"
                :class="selectedGroup === group ? groupAccentActive(group) : 'border-zinc-200 text-muted-foreground dark:border-zinc-800'"
                @click="selectedGroup = group"
              >{{ group }}</button>
            </div>
          </div>

          <div>
            <p class="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Member</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class="rounded-md border px-2.5 py-1.5 text-xs font-medium"
                :class="!selectedMember ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-muted-foreground dark:border-zinc-800'"
                @click="selectedMember = null"
              >All</button>
              <button
                v-for="m in MEMBERS[selectedGroup] || []"
                :key="m"
                type="button"
                class="rounded-md border px-2.5 py-1.5 text-xs font-medium"
                :class="selectedMember === m ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-muted-foreground dark:border-zinc-800'"
                @click="selectedMember = m"
              >{{ m }}</button>
            </div>
          </div>

          <div>
            <p class="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Card Type</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class="rounded-md border px-2.5 py-1.5 text-xs font-medium"
                :class="!selectedCardType ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-muted-foreground dark:border-zinc-800'"
                @click="selectedCardType = null"
              >All</button>
              <button
                v-for="t in CARD_TYPES"
                :key="t"
                type="button"
                class="rounded-md border px-2.5 py-1.5 text-xs font-medium"
                :class="selectedCardType === t ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-200 text-muted-foreground dark:border-zinc-800'"
                @click="selectedCardType = t"
              >{{ t }}</button>
            </div>
          </div>

          <div>
            <p class="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Price (IDR)</p>
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
