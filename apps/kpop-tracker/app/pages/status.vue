<script setup lang="ts">
import { Lock, RefreshCw } from 'lucide-vue-next'

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

// `fmt` is already this file's date formatter below; the number helper from
// useLocale is aliased so both can be used without shadowing.
const { t, fmt: fmtCount } = useLocale()
const { user, checked: authChecked, refresh: refreshAuth } = useAuth()

interface ErrorRow {
  id: number
  scope: string
  message: string
  stack: string | null
  path: string | null
  created_at: string
}
const gate = ref<'checking' | 'guest' | 'forbidden' | 'admin'>('checking')

/**
 * This page renders against the visitor's own session, so the gate and all three
 * panels are in the server-rendered HTML instead of arriving after three waves
 * of round trips (auth, then status+history, then errors — on a cold instance
 * that was a visible spinner for well over a second).
 *
 * That makes /status the one page whose output depends on the request. It must
 * never be given `isr` or `swr` in nuxt.config.ts: a cached copy would hand the
 * admin error log — stack traces and file paths — to every visitor, which is a
 * leak rather than mere staleness. tests/status-cache.test.ts fails if anyone
 * adds it. Do not delete that test to make a change pass.
 */
const reqHeaders = useRequestHeaders(['cookie'])
// Browsers send the cookie on their own fetches; only the server-rendered
// self-call needs it spelled out, and the browser ignores it there anyway.
const ssrOpts = import.meta.server && reqHeaders.cookie
  ? { headers: { cookie: reqHeaders.cookie } }
  : undefined

if (!authChecked.value) await refreshAuth(ssrOpts)

const isAdmin = user.value?.role === 'admin'
gate.value = !user.value ? 'guest' : isAdmin ? 'admin' : 'forbidden'

if (!user.value) await navigateTo('/login?next=/status')

// useAsyncData rather than bare $fetch: during hydration it reads the payload
// instead of re-running, so the client does not repeat what the server did.
// Errors are fetched in the same wave as status/history rather than after them,
// so the panels settle together. Each call swallows its own failure — a dead
// error log must not blank out the sync history.
const panels = useAsyncData(
  'status:panels',
  async () => {
    if (!isAdmin) return { summary: null, runs: [], errors: [] }

    const [statusRes, historyRes, errorRes] = await Promise.all([
      $fetch<{ success: boolean, data: SyncSummary }>('/api/sync/status', ssrOpts),
      $fetch<{ success: boolean, data: SyncRun[] }>('/api/sync/history', ssrOpts).catch(() => null),
      $fetch<{ success: boolean, data: ErrorRow[] }>('/api/errors', ssrOpts).catch(() => null),
    ])

    return {
      summary: statusRes?.success ? statusRes.data : null,
      runs: historyRes?.success ? historyRes.data || [] : [],
      errors: errorRes?.success ? errorRes.data || [] : [],
    }
  },
  { immediate: isAdmin },
)

const { data: panelsRes } = panels
const summary = computed<SyncSummary | null>(() => panelsRes.value?.summary ?? null)
const runs = computed<SyncRun[]>(() => panelsRes.value?.runs ?? [])
const errors = computed<ErrorRow[]>(() => panelsRes.value?.errors ?? [])
const loading = computed(() => panels.pending.value)
// One wave now, so the error panel's skeleton can retire with the rest instead
// of tracking its own second request.
const errorsChecked = computed(() => !panels.pending.value)

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
  return STATUS_STYLES[status] || { label: status, chip: 'bg-muted-foreground/10 text-muted-foreground ring-zinc-500/30', dot: 'bg-muted-foreground' }
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
      <template v-if="gate === 'admin'">
      <section class="border-b border-border">
        <div class="page-shell py-8 sm:py-10">
          <p class="eyebrow">{{ t('status.systemEyebrow') }}</p>
          <h1 class="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{{ t('palette.nav.status') }}</h1>
          <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {{ t('status.desc') }}
          </p>

          <div class="mt-6 grid gap-3 sm:grid-cols-3">
            <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p class="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{{ t('nav.browse') }}</p>
              <p class="mt-1.5 text-lg font-semibold tabular-nums text-foreground">
                {{ summary ? fmtCount(summary.total) : '—' }}
              </p>
              <p class="text-xs text-muted-foreground">{{ t('status.tracked') }}</p>
            </div>
            <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p class="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{{ t('status.lastDataUpdate') }}</p>
              <p class="mt-1.5 text-lg font-semibold tabular-nums text-foreground">
                {{ fmtShort(summary?.last_synced || null) }}
              </p>
              <p class="text-xs text-muted-foreground">{{ t('status.latestRefresh') }}</p>
            </div>
            <div class="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p class="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{{ t('status.lastRun') }}</p>
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
            <p class="eyebrow">{{ t('status.history') }}</p>
            <h2 class="mt-1.5 text-lg font-semibold tracking-tight text-foreground sm:text-xl">{{ t('status.recentRuns') }}</h2>
          </div>
          <span class="text-xs text-muted-foreground">{{ t('status.lastOf', { count: runs.length || 0 }) }}</span>
        </div>

        <div v-if="loading" class="space-y-3">
          <div v-for="i in 3" :key="i" class="skeleton-block h-20 rounded-xl" />
        </div>

        <div v-else-if="runs.length === 0" class="rounded-xl border border-dashed border-border py-12 text-center">
          <RefreshCw class="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p class="mt-3 text-sm font-medium text-foreground">{{ t('status.emptyTitle') }}</p>
          <p class="mt-1 text-sm text-muted-foreground">{{ t('status.emptyHint') }}</p>
        </div>

        <ul
          v-else
          tabindex="0"
          :aria-label="t('status.recentRuns')"
          class="max-h-[420px] space-y-3 overflow-y-auto overscroll-contain pb-3"
        >
          <li
            v-for="run in runs"
            :key="run.id"
            class="rounded-xl border border-border bg-card p-4 shadow-sm"
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
                <span v-if="run.total_synced != null">{{ fmtCount(run.total_synced) }} {{ t('sync.cards') }}</span>
              </div>
            </div>

            <div v-if="run.groups.length" class="mt-3 flex flex-wrap gap-1.5">
              <span
                v-for="group in run.groups"
                :key="group.group"
                class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
                :class="group.success
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-red-500/10 text-red-700 dark:text-red-400'"
                :title="group.success
                  ? t('status.groupChipCards', { group: group.group, count: fmtCount(Number(group.totalSynced || 0)) })
                  : `${group.group}: ${group.error || t('status.failed')}`"
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

      <section class="page-shell pb-10">
        <div class="mb-4">
          <p class="eyebrow">{{ t('status.monitoring') }}</p>
          <h2 class="mt-1.5 text-lg font-semibold tracking-tight text-foreground sm:text-xl">{{ t('status.errors') }}</h2>
        </div>

        <div v-if="!errorsChecked" class="space-y-3">
          <div v-for="i in 2" :key="i" class="skeleton-block h-16 rounded-xl" />
        </div>

        <div v-else-if="!user" class="rounded-xl border border-dashed border-border py-8 text-center">
          <p class="text-sm text-muted-foreground">{{ t('status.loginForErrors') }}</p>
          <Button variant="outline" class="mt-3 rounded-lg" as-child>
            <NuxtLink to="/login">{{ t('auth.login') }}</NuxtLink>
          </Button>
        </div>

        <div v-else-if="errors.length === 0" class="rounded-xl border border-dashed border-border py-8 text-center">
          <p class="text-sm text-muted-foreground">{{ t('status.errorsEmpty') }}</p>
        </div>

        <ul
          v-else
          tabindex="0"
          :aria-label="t('status.errors')"
          class="max-h-[420px] space-y-3 overflow-y-auto overscroll-contain pb-3"
        >
          <li
            v-for="row in errors"
            :key="row.id"
            class="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <div class="flex min-w-0 items-center gap-2">
                <span
                  class="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset"
                  :class="row.scope === 'server'
                    ? 'bg-red-500/10 text-red-700 ring-red-500/30 dark:text-red-400'
                    : 'bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-400'"
                >
                  {{ row.scope === 'server' ? t('status.scopeServer') : t('status.scopeClient') }}
                </span>
                <span class="truncate text-sm font-medium text-foreground">{{ row.message }}</span>
              </div>
              <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ fmtShort(row.created_at) }}</span>
            </div>
            <p v-if="row.path" class="mt-1 truncate text-xs text-muted-foreground">{{ row.path }}</p>
            <details v-if="row.stack" class="mt-2">
              <summary class="cursor-pointer text-xs text-muted-foreground">{{ t('status.stack') }}</summary>
              <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground dark:bg-muted/60">{{ row.stack }}</pre>
            </details>
          </li>
        </ul>
      </section>
      </template>

      <section
        v-else-if="gate === 'forbidden'"
        class="page-shell flex min-h-[50vh] flex-col items-center justify-center py-12 text-center"
      >
        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock class="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </span>
        <h1 class="mt-4 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {{ t('status.forbiddenTitle') }}
        </h1>
        <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {{ t('status.forbiddenDesc') }}
        </p>
        <Button as-child class="mt-5 rounded-lg">
          <NuxtLink to="/">{{ t('status.backHome') }}</NuxtLink>
        </Button>
      </section>

      <section v-else class="page-shell py-12">
        <div class="space-y-3">
          <div v-for="i in 3" :key="i" class="skeleton-block h-20 rounded-xl" />
        </div>
      </section>
    </main>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
