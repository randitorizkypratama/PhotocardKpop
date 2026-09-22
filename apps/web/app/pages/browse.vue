<script setup lang="ts">
const groups = ['IVE', 'aespa', 'Hearts2Hearts']
const members: Record<string, string[]> = {
  IVE: ['WONYOUNG', 'LIZ', 'GAEUL', 'REI', 'YUJIN', 'LEESEO'],
  aespa: ['KARINA', 'WINTER', 'GISELLE', 'NINGNING'],
  Hearts2Hearts: ['IAN', 'JIWOO', 'YE-ON', 'Carmen', 'Stella', 'YUHA'],
}

const selectedGroup = ref('IVE')
const selectedMember = ref<string | null>(null)

const { cards, loading, fetchCards, loadMore, hasNextPage } = useCards()

onMounted(() => {
  fetchCards(selectedGroup.value)
})

watch(selectedGroup, (group) => {
  selectedMember.value = null
  fetchCards(group)
})

watch(selectedMember, (member) => {
  fetchCards(selectedGroup.value, 1, member || undefined)
})

function handleLoadMore() {
  loadMore(selectedGroup.value, selectedMember.value || undefined)
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
      <h1 class="mb-6 text-2xl font-bold">Browse Photocards</h1>

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

      <!-- Cards Grid -->
      <div v-if="loading && cards.length === 0" class="flex justify-center py-8">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>

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
              <span>❤️ {{ card.wish_count }}</span>
              <span>📦 {{ card.stocked_count }}</span>
            </div>
          </div>
        </NuxtLink>
      </div>

      <div v-if="!loading && cards.length === 0" class="py-8 text-center text-muted-foreground">
        No cards found
      </div>

      <!-- Load More -->
      <div v-if="hasNextPage" class="mt-6 flex justify-center">
        <button
          :disabled="loading"
          class="rounded-md bg-secondary px-6 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
          @click="handleLoadMore"
        >
          {{ loading ? 'Loading...' : 'Load More' }}
        </button>
      </div>
    </main>
  </div>
</template>
