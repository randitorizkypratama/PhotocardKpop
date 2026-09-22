<script setup lang="ts">
const syncStatus = ref<'idle' | 'syncing' | 'done' | 'error'>('idle')
const syncLog = ref<string[]>([])
const currentGroup = ref('')
const progress = ref({ IVE: 0, aespa: 0, Hearts2Hearts: 0 })
const totals = ref({ IVE: 0, aespa: 0, Hearts2Hearts: 0 })
const cancelled = ref(false)
const MAX_PAGES_PER_BATCH = 3

function addLog(msg: string) {
  syncLog.value.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
}

async function startSync() {
  syncStatus.value = 'syncing'
  syncLog.value = []
  cancelled.value = false
  
  const groups = ['IVE', 'aespa', 'Hearts2Hearts']
  
  for (const group of groups) {
    if (cancelled.value) break
    
    currentGroup.value = group
    addLog(`Starting sync for ${group}...`)
    
    let hasMore = true
    let page = 1
    let totalSynced = 0
    
    while (hasMore && !cancelled.value) {
      addLog(`Fetching ${group} page ${page}...`)
      
      try {
        const response = await $fetch<any>('/api/sync', {
          method: 'POST',
          query: { group, startPage: page, maxPages: MAX_PAGES_PER_BATCH },
        })
        
        if (response.success && response.results.length > 0) {
          const result = response.results[0]
          
          if (result.status === 'success') {
            totalSynced += result.synced
            progress.value[group as keyof typeof progress] = totalSynced
            totals.value[group as keyof typeof totals] = result.total
            hasMore = result.hasMore
            page = result.nextPage || page + MAX_PAGES_PER_BATCH
            
            addLog(`${group}: +${result.synced} cards (${totalSynced} total, page ${result.lastPage}/${Math.ceil(result.total / 20)})`)
          } else {
            addLog(`${group}: Error - ${result.message}`)
            hasMore = false
          }
        } else {
          hasMore = false
        }
      } catch (e) {
        addLog(`${group}: Error - ${e}`)
        hasMore = false
      }
      
      // Delay between batches
      if (hasMore && !cancelled.value) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    }
    
    if (!cancelled.value) {
      addLog(`${group}: Done! ${totalSynced} cards synced.`)
    }
  }
  
  if (!cancelled.value) {
    syncStatus.value = 'done'
    addLog('All syncs completed!')
  } else {
    syncStatus.value = 'idle'
    addLog('Sync cancelled.')
  }
}

function cancelSync() {
  cancelled.value = true
}

function formatNumber(n: number) {
  return n.toLocaleString()
}

async function checkCounts() {
  const groups = ['IVE', 'aespa', 'Hearts2Hearts'] as const
  for (const group of groups) {
    const res = await $fetch<any>(`/api/cards?group=${group}&page=1&limit=1`)
    totals.value[group] = res.pagination.total
  }
  addLog('Card counts refreshed.')
}

onMounted(() => {
  checkCounts()
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

    <main class="container mx-auto max-w-2xl px-4 py-6">
      <h1 class="mb-2 text-2xl font-bold">Sync Photocards</h1>
      <p class="mb-6 text-sm text-muted-foreground">
        Sync all photocards from Pocamarket into the database. Each batch syncs 3 pages (60 cards) at a time due to serverless timeout limits.
      </p>

      <!-- Progress Cards -->
      <div class="mb-6 grid gap-4 sm:grid-cols-3">
        <div
          v-for="group in ['IVE', 'aespa', 'Hearts2Hearts']"
          :key="group"
          class="rounded-lg border p-4"
        >
          <div class="mb-2 flex items-center justify-between">
            <h3 class="font-medium">{{ group }}</h3>
            <span
              v-if="currentGroup === group && syncStatus === 'syncing'"
              class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            />
          </div>
          <div class="mb-2 text-sm text-muted-foreground">
            <template v-if="totals[group as keyof typeof totals] > 0">
              {{ formatNumber(progress[group as keyof typeof progress]) }} / {{ formatNumber(totals[group as keyof typeof totals]) }} cards
              <span v-if="progress[group as keyof typeof progress] > 0" class="text-primary">
                ({{ Math.round((progress[group as keyof typeof progress] / totals[group as keyof typeof totals]) * 100) }}%)
              </span>
            </template>
            <template v-else>
              {{ formatNumber(progress[group as keyof typeof progress]) }} cards synced
            </template>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              class="h-full bg-primary transition-all duration-300"
              :style="{
                width: totals[group as keyof typeof totals] > 0
                  ? `${Math.min(100, (progress[group as keyof typeof progress] / totals[group as keyof typeof totals]) * 100)}%`
                  : progress[group as keyof typeof progress] > 0 ? '100%' : '0%'
              }"
            />
          </div>
        </div>
      </div>

      <!-- Buttons -->
      <div class="mb-6 flex gap-3">
        <button
          v-if="syncStatus !== 'syncing'"
          class="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          @click="startSync"
        >
          Start Full Sync
        </button>
        <button
          v-else
          class="rounded-md bg-destructive px-6 py-3 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
          @click="cancelSync"
        >
          Cancel
        </button>
        <button
          class="rounded-md border border-border px-4 py-3 text-sm font-medium hover:bg-secondary"
          @click="checkCounts"
        >
          Refresh Counts
        </button>
      </div>

      <!-- Sync Log -->
      <div class="rounded-lg border">
        <div class="border-b px-4 py-2 font-medium">Sync Log</div>
        <div class="max-h-96 overflow-y-auto p-4 font-mono text-xs">
          <div v-if="syncLog.length === 0" class="text-muted-foreground">
            Click "Start Full Sync" to begin syncing all photocards from Pocamarket.
          </div>
          <div
            v-for="(log, index) in syncLog"
            :key="index"
            class="py-0.5"
          >
            {{ log }}
          </div>
          <div v-if="syncStatus === 'syncing'" class="py-0.5 text-primary animate-pulse">
            Syncing...
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
