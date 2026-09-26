<script setup lang="ts">
import { ArrowRight, AlertCircle } from 'lucide-vue-next'
import { GROUPS, groupDot } from '@/lib/catalog'

useHead({ title: 'Releases — HIBIKISHOP PC' })

const releases = ref<any[]>([])
const loading = ref(true)
const loadError = ref(false)
const selectedGroup = ref<string>('All')

onMounted(load)

async function load() {
  loading.value = true
  loadError.value = false
  try {
    const response = await $fetch<any>('/api/releases/timeline')
    if (response?.success) releases.value = response.data || []
    else loadError.value = true
  } catch (e) {
    console.error('Failed to load releases:', e)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

const filterTabs = ['All', ...GROUPS]

const filtered = computed(() =>
  selectedGroup.value === 'All'
    ? releases.value
    : releases.value.filter(release => release.group_name === selectedGroup.value),
)

const years = computed(() => {
  const buckets = new Map<string, any[]>()
  for (const release of filtered.value) {
    if (!release.release_date) continue
    const year = String(release.release_date).slice(0, 4)
    if (!buckets.has(year)) buckets.set(year, [])
    buckets.get(year)!.push(release)
  }
  return [...buckets.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([year, items]) => ({ year, items }))
})

const undated = computed(() => filtered.value.filter(release => !release.release_date))

const datedCount = computed(() => filtered.value.length - undated.value.length)

function formatDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function albumPath(release: any) {
  return `/releases/${encodeURIComponent(release.group_name)}/${release.slug}`
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader active="releases" />

    <main>
      <!-- Header -->
      <section class="border-b border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-8 sm:py-10">
          <p class="eyebrow">Comeback timeline</p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Releases</h1>
          <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every album, single and special release in the catalog, newest first. Release dates come from
            MusicBrainz and Apple&nbsp;Music; open a release to see its photocards.
          </p>

          <div v-if="!loading && !loadError" class="mt-5 flex flex-wrap gap-2">
            <button
              v-for="tab in filterTabs"
              :key="tab"
              type="button"
              class="rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :class="
                selectedGroup === tab
                  ? 'border-border bg-muted text-foreground'
                  : 'border-zinc-200 bg-card text-muted-foreground hover:border-zinc-300 hover:text-foreground dark:border-zinc-800 dark:hover:border-zinc-700'
              "
              :aria-pressed="selectedGroup === tab"
              @click="selectedGroup = tab"
            >
              <span class="inline-flex items-center gap-1.5">
                <span v-if="tab !== 'All'" class="h-1.5 w-1.5 rounded-full" :class="groupDot(tab)" />
                {{ tab }}
              </span>
            </button>
          </div>
        </div>
      </section>

      <!-- Error -->
      <div v-if="loadError && !loading" class="page-shell py-8">
        <div class="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/40" role="alert">
          <div class="flex items-start gap-2.5">
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p class="text-sm font-medium text-red-900 dark:text-red-200">Unable to load releases.</p>
          </div>
          <Button variant="outline" size="sm" class="rounded-lg" @click="load">Retry</Button>
        </div>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="page-shell py-8">
        <div class="space-y-3">
          <div v-for="i in 8" :key="i" class="flex items-center gap-4 border-b border-border pb-4">
            <div class="skeleton-block h-4 w-16" />
            <div class="skeleton-block h-14 w-14 shrink-0 rounded-lg" />
            <div class="min-w-0 flex-1 space-y-2">
              <div class="skeleton-block h-3.5 w-1/3" />
              <div class="skeleton-block h-3 w-1/4" />
            </div>
          </div>
        </div>
      </div>

      <!-- Timeline -->
      <div v-else-if="filtered.length > 0" class="page-shell py-8 sm:py-10">
        <p class="mb-6 text-xs text-muted-foreground">
          {{ datedCount }} release{{ datedCount === 1 ? '' : 's' }} with a date
          <span v-if="undated.length"> · {{ undated.length }} without one</span>
        </p>

        <section v-for="group in years" :key="group.year" class="mb-9">
          <div class="mb-1 flex items-baseline gap-3">
            <h2 class="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{{ group.year }}</h2>
            <span class="text-xs text-muted-foreground tabular-nums">
              {{ group.items.length }} release{{ group.items.length === 1 ? '' : 's' }}
            </span>
          </div>

          <div class="overflow-hidden rounded-xl border border-border bg-card">
            <NuxtLink
              v-for="(release, index) in group.items"
              :key="`${release.group_name}-${release.release_name}`"
              :to="albumPath(release)"
              class="group flex items-center gap-3.5 px-3.5 py-3 transition-colors duration-150 hover:bg-muted sm:gap-4 sm:px-4"
              :class="index > 0 ? 'border-t border-border' : ''"
            >
              <span class="w-12 shrink-0 text-xs tabular-nums text-muted-foreground sm:w-16">
                {{ formatDate(release.release_date) }}
              </span>

              <span class="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:h-14 sm:w-14">
                <img
                  v-if="release.image"
                  :src="release.image"
                  :alt="`${release.release_name} cover`"
                  loading="lazy"
                  decoding="async"
                  class="h-full w-full object-cover object-top"
                />
              </span>

              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span class="h-2 w-2 shrink-0 rounded-full" :class="groupDot(release.group_name)" aria-hidden="true" />
                  <span class="truncate text-sm font-medium text-foreground">{{ release.release_name }}</span>
                </span>
                <span class="mt-1 block truncate text-xs text-muted-foreground">
                  {{ release.group_name }}<template v-if="release.release_type"> · {{ release.release_type }}</template>
                  <template v-if="release.count > 0"> · {{ release.count.toLocaleString() }} cards</template>
                  <template v-else> · No cards yet</template>
                  <template v-if="release.label"> · {{ release.label }}</template>
                </span>
              </span>

              <ArrowRight class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </NuxtLink>
          </div>
        </section>

        <!-- No date yet -->
        <section v-if="undated.length > 0">
          <div class="mb-1 flex items-baseline gap-3">
            <h2 class="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Date pending</h2>
            <span class="text-xs text-muted-foreground tabular-nums">
              {{ undated.length }} release{{ undated.length === 1 ? '' : 's' }}
            </span>
          </div>

          <div class="overflow-hidden rounded-xl border border-dashed border-border bg-card">
            <NuxtLink
              v-for="(release, index) in undated"
              :key="`${release.group_name}-${release.release_name}`"
              :to="albumPath(release)"
              class="group flex items-center gap-3.5 px-3.5 py-3 transition-colors duration-150 hover:bg-muted sm:gap-4 sm:px-4"
              :class="index > 0 ? 'border-t border-border' : ''"
            >
              <span class="w-12 shrink-0 text-xs text-muted-foreground sm:w-16">—</span>

              <span class="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:h-14 sm:w-14">
                <img
                  v-if="release.image"
                  :src="release.image"
                  :alt="`${release.release_name} cover`"
                  loading="lazy"
                  decoding="async"
                  class="h-full w-full object-cover object-top"
                />
              </span>

              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span class="h-2 w-2 shrink-0 rounded-full" :class="groupDot(release.group_name)" aria-hidden="true" />
                  <span class="truncate text-sm font-medium text-foreground">{{ release.release_name }}</span>
                </span>
                <span class="mt-1 block truncate text-xs text-muted-foreground">
                  {{ release.group_name }}<template v-if="release.release_type"> · {{ release.release_type }}</template>
                  <template v-if="release.count > 0"> · {{ release.count.toLocaleString() }} cards</template>
                  <template v-else> · No cards yet</template>
                </span>
              </span>

              <ArrowRight class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </NuxtLink>
          </div>
        </section>
      </div>

      <!-- Empty -->
      <div v-else class="page-shell py-10">
        <div class="rounded-xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
          <p class="text-sm font-medium text-foreground">No releases found.</p>
          <p class="mt-1 text-sm text-muted-foreground">Try another group or check back after the daily sync.</p>
        </div>
      </div>
    </main>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
