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
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="container mx-auto flex h-14 items-center px-4">
        <NuxtLink to="/" class="flex items-center space-x-2">
          <span class="text-xl font-bold">K-Pop PC</span>
        </NuxtLink>
        <nav class="ml-auto flex items-center space-x-4">
          <NuxtLink to="/" class="text-sm font-medium hover:underline">Home</NuxtLink>
          <NuxtLink to="/browse" class="text-sm font-medium hover:underline">Browse</NuxtLink>
          <NuxtLink to="/collection" class="text-sm font-medium hover:underline">Collection</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="container mx-auto px-4 py-6">
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">Browse Photocards</h1>
        <span v-if="!loading" class="text-sm text-muted-foreground">
          {{ total.toLocaleString() }} cards
        </span>
      </div>

      <!-- Group Tabs -->
      <div class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="group in groups"
          :key="group"
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            selectedGroup === group
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          ]"
          @click="selectedGroup = group"
        >
          {{ group }}
        </button>
      </div>

      <!-- Member Filter -->
      <div class="mb-6 flex flex-wrap gap-2">
        <button
          :class="[
            'px-3 py-1 rounded-full text-xs font-medium transition-colors',
            selectedMember === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          ]"
          @click="selectedMember = null"
        >
          All Members
        </button>
        <button
          v-for="member in members[selectedGroup]"
          :key="member"
          :class="[
            'px-3 py-1 rounded-full text-xs font-medium transition-colors',
            selectedMember === member
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          ]"
          @click="selectedMember = member"
        >
          {{ member }}
        </button>
      </div>

      <!-- Loading Skeleton -->
      <div v-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div v-for="i in pageSize" :key="i" class="rounded-lg border bg-card shadow-sm overflow-hidden">
          <div class="aspect-square bg-muted animate-pulse" />
          <div class="p-3 space-y-2">
            <div class="h-4 bg-muted rounded w-1/3 animate-pulse" />
            <div class="h-4 bg-muted rounded w-full animate-pulse" />
            <div class="h-4 bg-muted rounded w-2/3 animate-pulse" />
            <div class="flex justify-between">
              <div class="h-6 bg-muted rounded w-1/4 animate-pulse" />
              <div class="h-4 bg-muted rounded w-1/4 animate-pulse" />
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
          class="group rounded-lg border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md"
        >
          <div class="aspect-square overflow-hidden rounded-t-lg">
            <img
              :src="card.image"
              :alt="card.name"
              class="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          </div>
          <div class="p-3">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-xs text-muted-foreground">{{ card.group_name }}</span>
              <span class="rounded-full bg-secondary px-2 py-0.5 text-xs">{{ card.card_type }}</span>
            </div>
            <h3 class="line-clamp-2 text-sm font-medium">{{ card.name }}</h3>
            <div class="mt-2 flex items-center justify-between">
              <span class="text-lg font-bold">${{ card.discounted_price || card.price }}</span>
              <span v-if="card.is_in_promotion" class="text-xs text-green-600">-{{ card.discount_rate }}%</span>
            </div>
            <p class="text-xs text-muted-foreground">{{ card.member_name }}</p>
            <div class="mt-2 flex items-center space-x-2 text-xs text-muted-foreground">
              <span>{{ card.wish_count }} wishes</span>
              <span>{{ card.stocked_count }} in stock</span>
            </div>
          </div>
        </NuxtLink>
      </div>

      <div v-if="!loading && cards.length === 0" class="py-8 text-center text-muted-foreground">
        No cards found. Try syncing data first.
      </div>

      <!-- Pagination -->
      <div v-if="!loading && totalPages > 1" class="mt-8 flex flex-col items-center gap-4">
        <p class="text-sm text-muted-foreground">
          Page {{ currentPage }} of {{ totalPages.toLocaleString() }} ({{ total.toLocaleString() }} cards)
        </p>
        
        <div class="flex items-center gap-1">
          <button
            :disabled="currentPage === 1"
            class="px-3 py-2 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="prevPage"
          >
            Previous
          </button>
          
          <template v-for="(page, index) in visiblePages" :key="index">
            <span v-if="page === '...'" class="px-2 text-muted-foreground">...</span>
            <button
              v-else
              :class="[
                'min-w-[40px] px-3 py-2 rounded-md text-sm font-medium',
                page === currentPage
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              ]"
              @click="goToPage(page as number)"
            >
              {{ page }}
            </button>
          </template>
          
          <button
            :disabled="currentPage === totalPages"
            class="px-3 py-2 rounded-md text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="nextPage"
          >
            Next
          </button>
        </div>
      </div>
    </main>
  </div>
</template>
