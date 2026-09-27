<template>
  <footer class="border-t border-zinc-200 bg-card dark:border-zinc-800">
    <div class="page-shell flex flex-col gap-6 py-10 sm:py-12">
      <div class="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div class="max-w-sm">
          <div class="flex items-center gap-2.5">
            <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-9 w-9 rounded-full object-contain" />
            <div class="leading-tight">
              <span class="block text-sm font-semibold text-foreground">HIBIKISHOP</span>
              <span class="block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Photocards</span>
            </div>
          </div>
          <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
            K-pop photocard catalog &amp; collection tracker.
          </p>
          <div class="mt-4">
            <SocialLinks size="sm" />
          </div>
        </div>

        <nav class="flex flex-col gap-2.5" aria-label="Footer">
          <NuxtLink to="/browse" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Browse</NuxtLink>
          <NuxtLink to="/#groups" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Groups</NuxtLink>
          <NuxtLink to="/shop" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Shop</NuxtLink>
          <NuxtLink to="/collection" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Collection</NuxtLink>
        </nav>
      </div>

      <Separator />

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-xs text-muted-foreground">
          © {{ year }} Copyright by
          <span class="font-medium text-foreground">HIBIKISHOP</span>
          · Data based on
          <a
            href="https://pocamarket.com"
            target="_blank"
            rel="noopener noreferrer"
            class="font-medium text-foreground underline-offset-2 hover:underline"
          >POCAMARKET</a>
        </p>
        <div class="flex flex-col items-start gap-1 sm:items-end">
          <p
            v-if="syncIssue"
            class="flex items-center gap-1.5 text-xs tabular-nums"
            :class="syncIssue.level === 'error'
              ? 'text-red-600 dark:text-red-400'
              : 'text-amber-600 dark:text-amber-400'"
            :title="syncIssue.title"
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="syncIssue.level === 'error' ? 'bg-red-500' : 'bg-amber-500'"
              aria-hidden="true"
            />
            {{ syncIssue.text }}<template v-if="syncedLabel"> · data {{ syncedLabel }}</template>
          </p>
          <p v-else-if="syncedLabel" class="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Synced {{ syncedLabel }} · {{ statusTotal.toLocaleString() }} cards
          </p>
          <p class="text-xs text-muted-foreground">K-Pop Photocard Tracker</p>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
const year = new Date().getFullYear()

interface SyncLogRun {
  started_at: string
  finished_at: string | null
  status: string
  total_synced: number | null
  error: string | null
}

const lastSynced = ref<string | null>(null)
const statusTotal = ref(0)
const lastRun = ref<SyncLogRun | null>(null)

onMounted(async () => {
  try {
    const response = await $fetch<{
      success: boolean
      data: { last_synced: string | null, total: number, last_run?: SyncLogRun | null }
    }>('/api/sync/status')
    if (response?.success && response.data?.last_synced) {
      lastSynced.value = response.data.last_synced
      statusTotal.value = response.data.total
      lastRun.value = response.data.last_run ?? null
    }
  } catch {
    // The badge is optional — the footer still renders without it.
  }
})

function formatStamp(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const syncedLabel = computed(() => formatStamp(lastSynced.value))

/**
 * Only surfaces *problems*: a failed/partial run, or one stuck in "running"
 * for over 15 minutes (function killed mid-sync). Healthy runs keep the
 * normal green badge.
 */
const syncIssue = computed<{ level: 'error' | 'warn', text: string, title: string } | null>(() => {
  const run = lastRun.value
  if (!run) return null
  const detail = run.error || `run started ${formatStamp(run.started_at)}`

  if (run.status === 'error') {
    return { level: 'error', text: `Sync failed ${formatStamp(run.started_at)}`, title: detail }
  }
  if (run.status === 'partial') {
    return { level: 'warn', text: `Sync partial ${formatStamp(run.finished_at || run.started_at)}`, title: detail }
  }
  if (run.status === 'running') {
    const started = new Date(run.started_at).getTime()
    if (Number.isFinite(started) && Date.now() - started > 15 * 60 * 1000) {
      return { level: 'error', text: `Sync stuck since ${formatStamp(run.started_at)}`, title: detail }
    }
  }
  return null
})
</script>
