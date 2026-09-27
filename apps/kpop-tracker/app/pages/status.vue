<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'

useHead({ title: 'Sync status — HIBIKISHOP PC' })
useSeoMeta({
  ogTitle: 'Sync status — HIBIKISHOP PC',
  ogDescription: 'Daily Pocamarket sync runs and history — what ran, how long it took, and whether anything failed.',
  ogUrl: 'https://kpop-tracker-six.vercel.app/status',
})

interface SyncRun {
  id: number
  started_at: string
  finished_at: string | null
  status: string
  total_synced: number | null
  error: string | null
  groups: Array<{ group: string, success: boolean, totalSynced?: number, error?: string }>
}

interface SyncSummary {
  last_synced: string | null
  total: number
  last_run: {
    started_at: string
    finished_at: string | null
    status: string
    total_synced: number | null
    error: string | null
  } | null
}

const summary = ref<SyncSummary | null>(null)
const runs = ref<SyncRun[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [statusRes, historyRes] = await Promise.all([
      $fetch<{ success: boolean, data: SyncSummary }>('/api/sync/status'),
      $fetch<{ success: boolean, data: SyncRun[] }>('/api/sync/history'),
    ])
    if (statusRes?.success) summary.value = statusRes.data
    if (historyRes?.success) runs.value = historyRes.data || []
  } catch {
    // Render whatever we got; the empty state covers the rest.
  } finally {
    loading.value = false
  }
})

const STATUS_STYLES: Record<string, { label: string, chip: string, dot: string }> = {
  ok: {
    label: 'OK',
    chip: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  partial: {
    label: 'Partial',
    chip: 'bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  error: {
    label: 'Error',
    chip: 'bg-red-500/10 text-red-700 ring-red-500/30 dark:text-red-400',
    dot: 'bg-red-500',
  },
  running: {
    label: 'Running',
    chip: 'bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-400',
    dot: 'bg-sky-500',
  },
}

function statusStyle(status: string) {
  return STATUS_STYLES[status] || { label: status, chip: 'bg-zinc-500/10 text-zinc-600 ring-zinc-500/30 dark:text-zinc-400', dot: 'bg-zinc-400' }
}

function fmt(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtShort(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function duration(run: { started_at: string, finished_at: string | null }) {
  if (!run.finished_at) return null
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader />

    <main>
      <section class="border-b border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-8 sm:py-10">
          <p class="eyebrow">System status</p>
          <h1 class="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Sync status</h1>
          <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Daily Pocamarket sync (00:00 WIB) and its run history — what ran, how long it took, and whether anything failed.
          </p>

          <div class="mt-6 grid gap-3 sm:grid-cols-3">
            <div class="rounded-xl border border-zinc-200 bg-card p-4 shadow-sm dark:border-zinc-800">
              <p class="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Catalog</p>
              <p class="mt-1.5 text-lg font-semibold tabular-nums text-foreground">
                {{ summary ? summary.total.toLocaleString() : '—' }}
              </p>
              <p class="text-xs text-muted-foreground">photocards tracked</p>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-card p-4 shadow-sm dark:border-zinc-800">
              <p class="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Last data update</p>
              <p class="mt-1.5 text-lg font-semibold tabular-nums text-foreground">
                {{ fmtShort(summary?.last_synced || null) }}
              </p>
              <p class="text-xs text-muted-foreground">latest card refresh</p>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-card p-4 shadow-sm dark:border-zinc-800">
              <p class="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Last run</p>
              <div class="mt-1.5 flex items-center gap-2">
                <span
                  v-if="summary?.last_run"
                  class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset"
                  :class="statusStyle(summary.last_run.status).chip"
                >
                  <span class="h-1.5 w-1.5 rounded-full" :class="statusStyle(summary.last_run.status).dot" aria-hidden="true" />
                  {{ statusStyle(summary.last_run.status).label }}
                </span>
                <span v-else class="text-lg font-semibold text-foreground">—</span>
              </div>
              <p v-if="summary?.last_run" class="mt-1 text-xs text-muted-foreground">
                {{ fmtShort(summary.last_run.started_at) }}
                <template v-if="duration(summary.last_run)"> · {{ duration(summary.last_run) }}</template>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="page-shell py-8 sm:py-10">
        <div class="mb-4 flex items-end justify-between gap-3">
          <div>
            <p class="eyebrow">History</p>
            <h2 class="mt-1.5 text-lg font-semibold tracking-tight text-foreground sm:text-xl">Recent runs</h2>
          </div>
          <span class="text-xs text-muted-foreground">last {{ runs.length || 0 }} of 30</span>
        </div>

        <div v-if="loading" class="space-y-3">
          <div v-for="i in 3" :key="i" class="skeleton-block h-20 rounded-xl" />
        </div>

        <div v-else-if="runs.length === 0" class="rounded-xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
          <RefreshCw class="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p class="mt-3 text-sm font-medium text-foreground">No sync runs recorded yet.</p>
          <p class="mt-1 text-sm text-muted-foreground">History appears after the first scheduled run at 00:00 WIB.</p>
        </div>

        <ul v-else class="space-y-3">
          <li
            v-for="run in runs"
            :key="run.id"
            class="rounded-xl border border-zinc-200 bg-card p-4 shadow-sm dark:border-zinc-800"
          >
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div class="flex min-w-0 items-center gap-2.5">
                <span
                  class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset"
                  :class="statusStyle(run.status).chip"
                >
                  <span class="h-1.5 w-1.5 rounded-full" :class="statusStyle(run.status).dot" aria-hidden="true" />
                  {{ statusStyle(run.status).label }}
                </span>
                <span class="truncate text-sm font-medium text-foreground">{{ fmt(run.started_at) }}</span>
              </div>

              <div class="flex items-center gap-4 text-xs tabular-nums text-muted-foreground">
                <span v-if="duration(run)" :title="`${fmt(run.started_at)} → ${fmt(run.finished_at)}`">
                  {{ duration(run) }}
                </span>
                <span v-if="run.total_synced != null">{{ run.total_synced.toLocaleString() }} cards</span>
              </div>
            </div>

            <div v-if="run.groups.length" class="mt-3 flex flex-wrap gap-1.5">
              <span
                v-for="group in run.groups"
                :key="group.group"
                class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
                :class="group.success
                  ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                  : 'bg-red-500/10 text-red-700 dark:text-red-400'"
                :title="group.success
                  ? `${group.group}: ${Number(group.totalSynced || 0).toLocaleString()} cards`
                  : `${group.group}: ${group.error || 'failed'}`"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="group.success ? 'bg-emerald-500' : 'bg-red-500'"
                  aria-hidden="true"
                />
                {{ group.group }}
              </span>
            </div>

            <p v-if="run.error" class="mt-2 break-words text-xs text-red-600 dark:text-red-400">{{ run.error }}</p>
          </li>
        </ul>
      </section>
    </main>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
