<script setup lang="ts">
const syncStatus = ref<'idle' | 'syncing' | 'done' | 'error'>('idle')
const syncResults = ref<any[]>([])
const syncLog = ref<string[]>([])
const currentGroup = ref('')
const progress = ref({ IVE: 0, aespa: 0, Hearts2Hearts: 0 })
const totals = ref({ IVE: 0, aespa: 0, Hearts2Hearts: 0 })

function addLog(msg: string) {
  syncLog.value.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
}

async function startSync() {
  syncStatus.value = 'syncing'
  syncResults.value = []
  syncLog.value = []
  
  const groups = ['IVE', 'aespa', 'Hearts2Hearts']
  
  for (const group of groups) {
    currentGroup.value = group
    addLog(`Starting sync for ${group}...`)
    
    let hasMore = true
    let page = 1
    const maxPagesPerBatch = 30
    
    while (hasMore) {
      addLog(`Syncing ${group} page ${page}...`)
      
      try {
        const response = await $fetch<any>('/api/sync', {
          method: 'POST',
          query: { group, startPage: page, maxPages: maxPagesPerBatch },
        })
        
        if (response.success && response.results.length > 0) {
          const result = response.results[0]
          
          if (result.status === 'success') {
            progress.value[group as keyof typeof progress] = result.synced
            totals.value[group as keyof typeof totals] = result.total
            hasMore = result.hasMore
            page = result.nextPage || page + maxPagesPerBatch
            
            addLog(`${group}: Synced ${result.synced} cards (${result.pagesProcessed} pages)`)
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
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  syncStatus.value = 'done'
  addLog('Sync completed!')
}

function formatNumber(n: number) {
  return n.toLocaleString()
}
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
          <NuxtLink to="/admin/sync" class="text-sm font-medium hover:underline">Sync</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="container mx-auto px-4 py-6">
      <h1 class="mb-6 text-2xl font-bold">Sync Photocards</h1>

      <!-- Progress Cards -->
      <div class="mb-6 grid gap-4 md:grid-cols-3">
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
            Synced: {{ formatNumber(progress[group as keyof typeof progress]) }}
            <template v-if="totals[group as keyof typeof totals] > 0">
              / {{ formatNumber(totals[group as keyof typeof totals]) }}
            </template>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              class="h-full bg-primary transition-all duration-300"
              :style="{
                width: totals[group as keyof typeof totals] > 0
                  ? `${(progress[group as keyof typeof progress] / totals[group as keyof typeof totals]) * 100}%`
                  : '0%'
              }"
            />
          </div>
        </div>
      </div>

      <!-- Sync Button -->
      <div class="mb-6">
        <button
          :disabled="syncStatus === 'syncing'"
          class="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="startSync"
        >
          <span v-if="syncStatus === 'syncing'" class="flex items-center gap-2">
            <span class="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            Syncing...
          </span>
          <span v-else>Start Full Sync</span>
        </button>
      </div>

      <!-- Sync Log -->
      <div class="rounded-lg border">
        <div class="border-b px-4 py-2 font-medium">Sync Log</div>
        <div class="max-h-96 overflow-y-auto p-4 font-mono text-sm">
          <div v-if="syncLog.length === 0" class="text-muted-foreground">
            Click "Start Full Sync" to begin syncing all photocards from Pocamarket.
          </div>
          <div
            v-for="(log, index) in syncLog"
            :key="index"
            class="py-1"
          >
            {{ log }}
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
