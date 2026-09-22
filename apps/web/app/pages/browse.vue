<script setup lang="ts">
const groups = ['IVE', 'aespa', 'Hearts2Hearts']
const members: Record<string, string[]> = {
  IVE: ['WONYOUNG', 'LIZ', 'GAEUL', 'REI', 'YUJIN', 'LEESEO'],
  aespa: ['KARINA', 'WINTER', 'GISELLE', 'NINGNING'],
  Hearts2Hearts: ['IAN', 'JIWOO', 'YE-ON', 'Carmen', 'Stella', 'YUHA'],
}

const selectedGroup = ref('IVE')
const selectedMember = ref<string | null>(null)
const currentPage = ref(1)
const pageSize = 20

const cards = ref<any[]>([])
const loading = ref(true)
const total = ref(0)
const totalPages = ref(0)

onMounted(() => {
  loadCards()
})

watch(selectedGroup, () => {
  selectedMember.value = null
  currentPage.value = 1
  loadCards()
})

watch(selectedMember, () => {
  currentPage.value = 1
  loadCards()
})

async function loadCards() {
  loading.value = true
  
  try {
    const params = new URLSearchParams({
      group: selectedGroup.value,
      page: String(currentPage.value),
      limit: String(pageSize),
    })
    
    if (selectedMember.value) {
      params.set('member', selectedMember.value)
    }
    
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

function goToPage(page: number) {
  currentPage.value = page
  loadCards()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    goToPage(currentPage.value + 1)
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    goToPage(currentPage.value - 1)
  }
}

const visiblePages = computed(() => {
  const pages: (number | string)[] = []
  const total = totalPages.value
  const current = currentPage.value
  
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
  } else {
    pages.push(1)
    if (current > 3) pages.push('...')
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      pages.push(i)
    }
    if (current < total - 2) pages.push('...')
    pages.push(total)
  }
  
  return pages
})
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
          <NuxtLink to="/browse" class="text-sm font-medium text-foreground">Browse</NuxtLink>
          <NuxtLink to="/collection" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Collection</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="container mx-auto px-4 py-8">
      <!-- Page Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-foreground">Browse Photocards</h1>
        <p class="mt-1 text-muted-foreground">
          <template v-if="!loading && total > 0">
            {{ total.toLocaleString() }} cards from Pocamarket
          </template>
          <template v-else>
            Explore the photocard collection
          </template>
        </p>
      </div>

      <!-- Filters -->
      <div class="mb-8 space-y-4">
        <!-- Group Tabs -->
        <div class="flex flex-wrap gap-2">
          <button
            v-for="group in groups"
            :key="group"
            :class="[
              'rounded-full px-5 py-2.5 text-sm font-medium transition-all',
              selectedGroup === group
                ? 'gradient-primary text-white shadow-lg shadow-primary/30'
                : 'glass-card text-foreground hover:shadow-md'
            ]"
            @click="selectedGroup = group"
          >
            {{ group }}
          </button>
        </div>

        <!-- Member Filter -->
        <div class="flex flex-wrap gap-2">
          <button
            :class="[
              'rounded-full px-4 py-2 text-sm font-medium transition-all',
              selectedMember === null
                ? 'bg-foreground text-background'
                : 'glass-card text-foreground hover:shadow-md'
            ]"
            @click="selectedMember = null"
          >
            All
          </button>
          <button
            v-for="member in members[selectedGroup]"
            :key="member"
            :class="[
              'rounded-full px-4 py-2 text-sm font-medium transition-all',
              selectedMember === member
                ? 'bg-foreground text-background'
                : 'glass-card text-foreground hover:shadow-md'
            ]"
            @click="selectedMember = member"
          >
            {{ member }}
          </button>
        </div>
      </div>

      <!-- Loading Skeleton -->
      <div v-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div v-for="i in pageSize" :key="i" class="glass-card overflow-hidden rounded-2xl">
          <div class="aspect-square animate-pulse bg-gradient-to-br from-purple-200 to-pink-200 dark:from-purple-800 dark:to-pink-800" />
          <div class="p-4 space-y-3">
            <div class="h-3 w-1/3 animate-pulse rounded-full bg-muted" />
            <div class="h-4 w-full animate-pulse rounded-full bg-muted" />
            <div class="h-4 w-2/3 animate-pulse rounded-full bg-muted" />
            <div class="flex justify-between">
              <div class="h-6 w-1/4 animate-pulse rounded-full bg-muted" />
              <div class="h-4 w-1/4 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
        </div>
      </div>

      <!-- Cards Grid -->
      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <NuxtLink
          v-for="card in cards"
          :key="card.id"
          :to="`/card/${card.id}`"
          class="group glass-card overflow-hidden rounded-2xl card-hover"
        >
          <div class="relative aspect-square overflow-hidden">
            <img
              :src="card.image"
              :alt="card.name"
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            
            <!-- Quick badge -->
            <div class="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur">
              {{ card.card_type }}
            </div>
            
            <!-- Promo badge -->
            <div v-if="card.is_in_promotion" class="absolute top-2 left-2 rounded-full bg-green-500 px-2 py-1 text-xs font-bold text-white">
              -{{ card.discount_rate }}%
            </div>
          </div>
          
          <div class="p-4">
            <p class="mb-1 text-xs font-medium text-primary">{{ card.member_name }}</p>
            <h3 class="line-clamp-2 text-sm font-semibold text-foreground">{{ card.name }}</h3>
            <div class="mt-3 flex items-center justify-between">
              <span class="text-xl font-bold text-foreground">${{ card.discounted_price || card.price }}</span>
              <div class="flex items-center gap-1 text-xs text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                {{ card.wish_count }}
              </div>
            </div>
            <div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{{ card.stocked_count }} in stock</span>
            </div>
          </div>
        </NuxtLink>
      </div>

      <!-- Empty State -->
      <div v-if="!loading && cards.length === 0" class="py-16 text-center">
        <div class="gradient-primary mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl text-4xl text-white">
          🔍
        </div>
        <h3 class="mb-2 text-xl font-semibold text-foreground">No cards found</h3>
        <p class="mb-6 text-muted-foreground">Try selecting a different member or group</p>
        <NuxtLink
          to="/admin/sync"
          class="gradient-primary inline-flex items-center gap-2 rounded-full px-6 py-3 font-medium text-white shadow-lg shadow-primary/30 transition-all hover:scale-105"
        >
          Sync Cards
        </NuxtLink>
      </div>

      <!-- Pagination -->
      <div v-if="!loading && totalPages > 1" class="mt-12">
        <div class="glass-card flex flex-col items-center gap-4 rounded-2xl p-6">
          <p class="text-sm text-muted-foreground">
            Page {{ currentPage }} of {{ totalPages.toLocaleString() }}
          </p>
          
          <div class="flex items-center gap-2">
            <button
              :disabled="currentPage === 1"
              class="glass-card rounded-full px-4 py-2 text-sm font-medium text-foreground transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              @click="prevPage"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            
            <template v-for="(page, index) in visiblePages" :key="index">
              <span v-if="page === '...'" class="px-2 text-muted-foreground">...</span>
              <button
                v-else
                :class="[
                  'min-w-[40px] rounded-full px-4 py-2 text-sm font-medium transition-all',
                  page === currentPage
                    ? 'bg-foreground text-background'
                    : 'glass-card text-foreground hover:shadow-md'
                ]"
                @click="goToPage(page as number)"
              >
                {{ page }}
              </button>
            </template>
            
            <button
              :disabled="currentPage === totalPages"
              class="glass-card rounded-full px-4 py-2 text-sm font-medium text-foreground transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              @click="nextPage"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
