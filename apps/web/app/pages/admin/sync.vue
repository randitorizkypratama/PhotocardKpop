<script setup lang="ts">
import { Sparkles, Play, XCircle, RefreshCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-vue-next'

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
        const response = await $fetch<any>('/api/sync', { method: 'POST', query: { group, startPage: page, maxPages: MAX_PAGES_PER_BATCH } })
        if (response.success && response.results.length > 0) {
          const result = response.results[0]
          if (result.status === 'success') {
            totalSynced += result.synced
            progress.value[group as keyof typeof progress] = totalSynced
            totals.value[group as keyof typeof totals] = result.total
            hasMore = result.hasMore
            page = result.nextPage || page + MAX_PAGES_PER_BATCH
            addLog(`${group}: +${result.synced} cards (${totalSynced} total, page ${result.lastPage}/${Math.ceil(result.total / 20)})`)
          } else { addLog(`${group}: Error - ${result.message}`); hasMore = false }
        } else { hasMore = false }
      } catch (e) { addLog(`${group}: Error - ${e}`); hasMore = false }
      if (hasMore && !cancelled.value) await new Promise(resolve => setTimeout(resolve, 300))
    }
    if (!cancelled.value) addLog(`${group}: Done! ${totalSynced} cards synced.`)
  }
  if (!cancelled.value) { syncStatus.value = 'done'; addLog('All syncs completed!') }
  else { syncStatus.value = 'idle'; addLog('Sync cancelled.') }
}

function cancelSync() { cancelled.value = true }
function formatNumber(n: number) { return n.toLocaleString() }

async function checkCounts() {
  const groups = ['IVE', 'aespa', 'Hearts2Hearts'] as const
  for (const group of groups) {
    const res = await $fetch<any>(`/api/cards?group=${group}&page=1&limit=1`)
    totals.value[group] = res.pagination.total
  }
  addLog('Card counts refreshed.')
}

onMounted(() => { checkCounts() })
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
          <NuxtLink to="/browse" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Browse</NuxtLink>
          <NuxtLink to="/collection" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Collection</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="container mx-auto max-w-2xl px-4 py-8">
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">Sync Photocards</h1>
      <p class="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Sync all photocards from Pocamarket into the database. Each batch syncs 3 pages (60 cards) at a time.
      </p>

      <div class="mb-6 grid gap-4 sm:grid-cols-3">
        <div v-for="group in ['IVE', 'aespa', 'Hearts2Hearts']" :key="group" class="glass-card rounded-2xl p-4">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="font-semibold text-slate-900 dark:text-white">{{ group }}</h3>
            <Loader2 v-if="currentGroup === group && syncStatus === 'syncing'" class="h-4 w-4 animate-spin text-purple-500" />
            <CheckCircle2 v-else-if="progress[group as keyof typeof progress] > 0 && progress[group as keyof typeof progress] >= totals[group as keyof typeof totals] && totals[group as keyof typeof totals] > 0" class="h-4 w-4 text-green-500" />
          </div>
          <div class="mb-2 text-sm text-slate-500 dark:text-slate-400">
            <template v-if="totals[group as keyof typeof totals] > 0">
              {{ formatNumber(progress[group as keyof typeof progress]) }} / {{ formatNumber(totals[group as keyof typeof totals]) }} cards
              <span class="font-medium text-purple-500">({{ Math.round((progress[group as keyof typeof progress] / totals[group as keyof typeof totals]) * 100) }}%)</span>
            </template>
            <template v-else>{{ formatNumber(progress[group as keyof typeof progress]) }} cards synced</template>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div class="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300" :style="{ width: totals[group as keyof typeof totals] > 0 ? `${Math.min(100, (progress[group as keyof typeof progress] / totals[group as keyof typeof totals]) * 100)}%` : progress[group as keyof typeof progress] > 0 ? '100%' : '0%' }" />
          </div>
        </div>
      </div>

      <div class="mb-6 flex gap-3">
        <button v-if="syncStatus !== 'syncing'" class="gradient-primary flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-105" @click="startSync">
          <Play class="h-4 w-4" /> Start Full Sync
        </button>
        <button v-else class="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 text-sm font-medium text-white shadow-lg transition-all hover:bg-red-600" @click="cancelSync">
          <XCircle class="h-4 w-4" /> Cancel
        </button>
        <button class="glass-card flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:shadow-md dark:text-slate-300" @click="checkCounts">
          <RefreshCw class="h-4 w-4" /> Refresh
        </button>
      </div>

      <div class="glass-card overflow-hidden rounded-2xl">
        <div class="border-b border-slate-200/50 px-4 py-3 font-medium text-slate-900 dark:border-slate-700/50 dark:text-white">Sync Log</div>
        <div class="max-h-96 overflow-y-auto p-4 font-mono text-xs">
          <div v-if="syncLog.length === 0" class="text-slate-500 dark:text-slate-400">
            Click "Start Full Sync" to begin syncing all photocards.
          </div>
          <div v-for="(log, index) in syncLog" :key="index" class="py-0.5 text-slate-700 dark:text-slate-300">
            {{ log }}
          </div>
          <div v-if="syncStatus === 'syncing'" class="py-0.5 text-purple-500 animate-pulse">
            Syncing...
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
