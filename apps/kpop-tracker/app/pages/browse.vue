<script setup lang="ts">
import {
  ChevronLeft, ChevronRight, Heart, Package, Search, Sparkles,
  SlidersHorizontal, X, ArrowUpDown, DollarSign, Tag, RefreshCw, TrendingUp, Disc3
} from 'lucide-vue-next'

const groups = ['IVE', 'aespa', 'Hearts2Hearts']
const members: Record<string, string[]> = {
  IVE: ['WONYONG', 'LIZ', 'GAEUL', 'REI', 'YUJIN', 'LEESEO'],
  aespa: ['KARINA', 'WINTER', 'GISELLE', 'NINGNING'],
  Hearts2Hearts: ['IAN', 'JIWOO', 'YE-ON', 'Carmen', 'Stella', 'YUHA'],
}
const releases: Record<string, string[]> = {
  IVE: ['EMPATHY', 'REVIVE+', 'SECRET', "I'VE IVE", 'LOVE DIVE', 'ELEVEN', 'AFTER LIKE', 'I AM', 'BADDIE', 'ALL NIGHT', 'HEAVEN', 'LOVED'],
  aespa: ['WHIP LASH', 'SPICY', 'GIRLS', 'FOREVER', 'NEXT LEVEL', 'SAVAGE', 'MY WORLD', 'DREAMS COME TRUE', 'ARMAGEDDON', 'Supernova'],
  Hearts2Hearts: ['THE FIRST ALBUM', 'THE SECOND SINGLE', 'THE THIRD SINGLE', 'THE FOURTH SINGLE'],
}
const cardTypes = ['Album', 'POB', 'Lucky Draw', 'MD', 'Fan Meeting', "Season's Greetings", 'Concert', 'Trading Card', 'Pop-up', 'Fan Club']
const sortOptions = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'stock', label: 'Most Stock' },
  { value: 'name', label: 'Name A-Z' },
]

const selectedGroup = ref('IVE')
const selectedMember = ref<string | null>(null)
const selectedCardType = ref<string | null>(null)
const selectedRelease = ref<string | null>(null)
const selectedSort = ref('popular')
const minPriceIDR = ref<string>('')
const maxPriceIDR = ref<string>('')
const showFilters = ref(false)
const currentPage = ref(1)
const pageSize = 20

const cards = ref<any[]>([])
const loading = ref(true)
const total = ref(0)
const totalPages = ref(0)
const exchangeRates = ref<any>(null)

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedMember.value) count++
  if (selectedCardType.value) count++
  if (selectedRelease.value) count++
  if (selectedSort.value !== 'popular') count++
  if (minPriceIDR.value) count++
  if (maxPriceIDR.value) count++
  return count
})

onMounted(() => {
  loadCards()
  loadExchangeRates()
})

async function loadExchangeRates() {
  try {
    const response = await $fetch<any>('/api/exchangerate')
    if (response.success) {
      exchangeRates.value = response.data
    }
  } catch (e) {
    console.error('Failed to load exchange rates:', e)
  }
}

watch(selectedGroup, () => {
  selectedMember.value = null
  selectedCardType.value = null
  selectedRelease.value = null
  currentPage.value = 1
  loadCards()
})

watch([selectedMember, selectedCardType, selectedRelease, selectedSort, minPriceIDR, maxPriceIDR], () => {
  currentPage.value = 1
  loadCards()
})

function idrToUSD(idr: number): number {
  const rate = exchangeRates.value?.usd?.rate
  return rate ? idr / rate : idr / 17800
}

async function loadCards() {
  loading.value = true
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
    if (minPriceIDR.value) params.set('min_price', String(Math.round(idrToUSD(Number(minPriceIDR.value)))))
    if (maxPriceIDR.value) params.set('max_price', String(Math.round(idrToUSD(Number(maxPriceIDR.value)))))
    const response = await $fetch<any>(`/api/cards?${params}`)
    if (response.success) {
      cards.value = response.data
      total.value = response.pagination.total
      totalPages.value = response.pagination.totalPages
    }
  } catch (e) {
    console.error('Failed to load cards:', e)
  } finally {
    loading.value = false
  }
}

function clearFilters() {
  selectedMember.value = null
  selectedCardType.value = null
  selectedRelease.value = null
  selectedSort.value = 'popular'
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
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 dark:from-slate-950 dark:via-purple-950 dark:to-slate-950">
    <header class="sticky top-0 z-50 glass border-b border-white/20">
      <div class="container mx-auto flex h-16 items-center justify-between px-4">
        <NuxtLink to="/" class="flex items-center gap-2">
          <Sparkles class="h-5 w-5 text-purple-500" />
          <span class="text-lg font-bold text-slate-900 dark:text-white">K-Pop PC</span>
        </NuxtLink>
        <nav class="flex items-center gap-6">
          <NuxtLink to="/" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Home</NuxtLink>
          <NuxtLink to="/browse" class="text-sm font-medium text-slate-900 dark:text-white">Browse</NuxtLink>
          <NuxtLink to="/collection" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Collection</NuxtLink>
        </nav>
      </div>
    </header>

    <!-- Exchange Rate Bar -->
    <div v-if="exchangeRates" class="glass border-b border-white/10">
      <div class="container mx-auto flex items-center justify-center gap-6 px-4 py-2 text-xs">
        <div class="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
          <TrendingUp class="h-3 w-3 text-green-500" />
          <span class="font-medium">Kurs BI:</span>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-slate-700 dark:text-slate-300">
            1 USD = <span class="font-semibold text-slate-900 dark:text-white">{{ Math.round(exchangeRates.usd?.rate)?.toLocaleString('id-ID') }}</span> IDR
          </span>
          <span class="text-slate-300 dark:text-slate-600">|</span>
          <span class="text-slate-700 dark:text-slate-300">
            1 MYR = <span class="font-semibold text-slate-900 dark:text-white">{{ Math.round(exchangeRates.myr?.rate)?.toLocaleString('id-ID') }}</span> IDR
          </span>
        </div>
        <span class="text-[10px] text-slate-400 dark:text-slate-500">{{ exchangeRates.date }}</span>
      </div>
    </div>

    <main class="container mx-auto px-4 py-8">
      <div class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-slate-900 dark:text-white">Browse Photocards</h1>
          <p class="mt-1 text-slate-500 dark:text-slate-400">
            {{ loading ? 'Loading...' : `${total.toLocaleString()} cards` }}
          </p>
        </div>
      </div>

      <!-- Group Tabs -->
      <div class="mb-4 flex flex-wrap gap-2">
        <button v-for="group in groups" :key="group" :class="[
          'rounded-full px-5 py-2.5 text-sm font-medium transition-all',
          selectedGroup === group
            ? 'gradient-primary text-white shadow-lg shadow-purple-500/30'
            : 'glass-card text-slate-700 hover:shadow-md dark:text-slate-300'
        ]" @click="selectedGroup = group">
          {{ group }}
        </button>
      </div>

      <!-- Filter Bar -->
      <div class="mb-6 flex flex-wrap items-center gap-3">
        <button class="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all glass-card text-slate-700 hover:shadow-md dark:text-slate-300" @click="showFilters = !showFilters">
          <SlidersHorizontal class="h-4 w-4" />
          Filters
          <span v-if="activeFilterCount > 0" class="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-[10px] font-bold text-white">{{ activeFilterCount }}</span>
        </button>

        <div class="relative">
          <select v-model="selectedSort" class="appearance-none rounded-full bg-white/80 px-4 py-2 pr-8 text-sm font-medium text-slate-700 backdrop-blur transition-all hover:shadow-md dark:bg-black/50 dark:text-slate-300">
            <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <ArrowUpDown class="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        </div>

        <div v-if="selectedMember" class="flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
          {{ selectedMember }}
          <button @click="selectedMember = null"><X class="h-3 w-3" /></button>
        </div>
        <div v-if="selectedCardType" class="flex items-center gap-1 rounded-full bg-pink-100 px-3 py-1 text-xs font-medium text-pink-700 dark:bg-pink-900/30 dark:text-pink-400">
          {{ selectedCardType }}
          <button @click="selectedCardType = null"><X class="h-3 w-3" /></button>
        </div>
        <div v-if="selectedRelease" class="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          {{ selectedRelease }}
          <button @click="selectedRelease = null"><X class="h-3 w-3" /></button>
        </div>
        <div v-if="minPriceIDR || maxPriceIDR" class="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Rp {{ Number(minPriceIDR || 0).toLocaleString('id-ID') }} - Rp {{ Number(maxPriceIDR || 0).toLocaleString('id-ID') }}
          <button @click="minPriceIDR = ''; maxPriceIDR = ''"><X class="h-3 w-3" /></button>
        </div>

        <button v-if="activeFilterCount > 0" class="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200" @click="clearFilters">
          Clear all
        </button>
      </div>

      <!-- Expanded Filters -->
      <Transition name="slide">
        <div v-if="showFilters" class="mb-6 glass-card rounded-2xl p-6">
          <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label class="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Heart class="h-3.5 w-3.5 text-pink-500" /> Member
              </label>
              <div class="flex flex-wrap gap-1.5">
                <button :class="['rounded-full px-3 py-1.5 text-xs font-medium transition-all', selectedMember === null ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700']" @click="selectedMember = null">All</button>
                <button v-for="m in members[selectedGroup]" :key="m" :class="['rounded-full px-3 py-1.5 text-xs font-medium transition-all', selectedMember === m ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700']" @click="selectedMember = m">{{ m }}</button>
              </div>
            </div>
            <div>
              <label class="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Tag class="h-3.5 w-3.5 text-purple-500" /> Card Type
              </label>
              <div class="flex flex-wrap gap-1.5">
                <button :class="['rounded-full px-3 py-1.5 text-xs font-medium transition-all', selectedCardType === null ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700']" @click="selectedCardType = null">All</button>
                <button v-for="t in cardTypes" :key="t" :class="['rounded-full px-3 py-1.5 text-xs font-medium transition-all', selectedCardType === t ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700']" @click="selectedCardType = t">{{ t }}</button>
              </div>
            </div>
            <div>
              <label class="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Disc3 class="h-3.5 w-3.5 text-blue-500" /> Release / Album
              </label>
              <div class="flex flex-wrap gap-1.5">
                <button :class="['rounded-full px-3 py-1.5 text-xs font-medium transition-all', selectedRelease === null ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700']" @click="selectedRelease = null">All</button>
                <button v-for="r in releases[selectedGroup]" :key="r" :class="['rounded-full px-3 py-1.5 text-xs font-medium transition-all', selectedRelease === r ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700']" @click="selectedRelease = r">{{ r }}</button>
              </div>
            </div>
            <div>
              <label class="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                <DollarSign class="h-3.5 w-3.5 text-green-500" /> Harga (IDR)
              </label>
              <div class="flex items-center gap-2">
                <input v-model="minPriceIDR" type="number" placeholder="Min (contoh: 50000)" class="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" />
                <span class="text-slate-400">—</span>
                <input v-model="maxPriceIDR" type="number" placeholder="Max (contoh: 200000)" class="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" />
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Loading -->
      <div v-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div v-for="i in pageSize" :key="i" class="glass-card overflow-hidden rounded-2xl">
          <div class="aspect-square animate-pulse bg-gradient-to-br from-purple-200 to-pink-200 dark:from-purple-800 dark:to-pink-800" />
          <div class="space-y-3 p-4">
            <div class="h-3 w-1/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            <div class="h-4 w-full animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            <div class="h-4 w-2/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            <div class="flex justify-between">
              <div class="h-6 w-1/4 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
              <div class="h-4 w-1/4 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        </div>
      </div>

      <!-- Cards -->
      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <NuxtLink v-for="card in cards" :key="card.id" :to="`/card/${card.id}`" class="group glass-card overflow-hidden rounded-2xl card-hover">
          <div class="relative aspect-square overflow-hidden">
            <img :src="card.image" :alt="card.name" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div class="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur">{{ card.card_type }}</div>
            <div v-if="card.is_in_promotion" class="absolute left-2 top-2 rounded-full bg-green-500 px-2 py-1 text-xs font-bold text-white">-{{ card.discount_rate }}%</div>
          </div>
          <div class="p-4">
            <div class="mb-1 flex items-center gap-1.5">
              <p class="text-xs font-medium text-purple-600 dark:text-purple-400">{{ card.member_name }}</p>
              <span v-if="card.release_name" class="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">{{ card.release_name }}</span>
            </div>
            <h3 class="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{{ card.name }}</h3>
            <div class="mt-3 flex items-center justify-between">
              <div>
                <span class="text-xl font-bold text-slate-900 dark:text-white">${{ card.discounted_price || card.price }}</span>
                <p v-if="exchangeRates?.usd?.rate" class="text-[10px] text-slate-400 dark:text-slate-500">
                  ~Rp {{ ((card.discounted_price || card.price) * exchangeRates.usd.rate).toLocaleString('id-ID', { maximumFractionDigits: 0 }) }}
                </p>
              </div>
              <div class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Heart class="h-3 w-3" />
                {{ card.wish_count }}
              </div>
            </div>
            <div class="mt-2 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              <Package class="h-3 w-3" />
              {{ card.stocked_count }} in stock
            </div>
          </div>
        </NuxtLink>
      </div>

      <!-- Empty -->
      <div v-if="!loading && cards.length === 0" class="py-16 text-center">
        <div class="gradient-primary mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl text-white">
          <Search class="h-10 w-10" />
        </div>
        <h3 class="mb-2 text-xl font-semibold text-slate-900 dark:text-white">No cards found</h3>
        <p class="mb-6 text-slate-500 dark:text-slate-400">Database is syncing daily at 00:00 WIB. Check back later!</p>
        <button class="gradient-primary inline-flex items-center gap-2 rounded-full px-6 py-3 font-medium text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-105" @click="clearFilters">
          Clear Filters
        </button>
      </div>

      <!-- Pagination -->
      <div v-if="!loading && totalPages > 1" class="mt-12">
        <div class="glass-card flex flex-col items-center gap-4 rounded-2xl p-6">
          <p class="text-sm text-slate-500 dark:text-slate-400">Page {{ currentPage }} of {{ totalPages.toLocaleString() }} ({{ total.toLocaleString() }} cards)</p>
          <div class="flex items-center gap-2">
            <button :disabled="currentPage === 1" class="glass-card rounded-full p-2 text-slate-700 transition-all hover:shadow-md disabled:opacity-50 dark:text-slate-300" @click="prevPage">
              <ChevronLeft class="h-5 w-5" />
            </button>
            <template v-for="(page, index) in visiblePages" :key="index">
              <span v-if="page === '...'" class="px-2 text-slate-400">...</span>
              <button v-else :class="[
                'min-w-[40px] rounded-full px-4 py-2 text-sm font-medium transition-all',
                page === currentPage
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'glass-card text-slate-700 hover:shadow-md dark:text-slate-300'
              ]" @click="goToPage(page as number)">
                {{ page }}
              </button>
            </template>
            <button :disabled="currentPage === totalPages" class="glass-card rounded-full p-2 text-slate-700 transition-all hover:shadow-md disabled:opacity-50 dark:text-slate-300" @click="nextPage">
              <ChevronRight class="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: all 0.3s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateY(-10px); max-height: 0; }
.slide-enter-to, .slide-leave-from { max-height: 500px; }
</style>
