<script setup lang="ts">
import { ArrowRight, AlertCircle, Music2 } from 'lucide-vue-next'
import { GROUPS, groupDot } from '@/lib/catalog'
import { ART_THUMB_WIDTHS, artworkSrcset, gridSrcset, onImageError } from '@/lib/imageVariants'

useHead({ title: 'Releases — HIBIKISHOP PC' })
useSeoMeta({
  ogTitle: 'Releases — HIBIKISHOP PC',
  ogDescription: 'K-pop comeback timeline — albums, EPs and singles with photocard counts per release.',
  ogUrl: 'https://kpop-tracker-six.vercel.app/releases',
})

const { t, fmt } = useLocale()

const route = useRoute()
const router = useRouter()

const queryGroup = String(route.query.group || 'All')
const selectedGroup = ref<string>(queryGroup === 'All' || GROUPS.includes(queryGroup as any) ? queryGroup : 'All')
const selectedType = ref<string>(String(route.query.type || 'All'))

// Fetched during SSR so the timeline (and its cover art) is in the HTML.
// The handler resolves to null instead of throwing — an unreachable API must
// render the error state, never take the page down with it.
const { data: timelineRes, pending: loading, refresh: load } = await useAsyncData(
  'releases:timeline',
  () => $fetch<any>('/api/releases/timeline').catch(() => null),
)

const releases = computed<any[]>(() => timelineRes.value?.data || [])
const loadError = computed(() => timelineRes.value == null || timelineRes.value?.success !== true)

const filterTabs = ['All', ...GROUPS]

// Counts follow the group filter so switching group reshuffles the type chips.
const releasesInGroup = computed(() =>
  releases.value.filter(release =>
    selectedGroup.value === 'All' || release.group_name === selectedGroup.value,
  ),
)

const typeTabs = computed(() => {
  const counts = new Map<string, number>()
  for (const release of releasesInGroup.value) {
    const type = release.release_type
    if (type) counts.set(type, (counts.get(type) || 0) + 1)
  }
  return [
    { type: 'All', count: releasesInGroup.value.length },
    ...[...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count })),
  ]
})

const filtered = computed(() =>
  releasesInGroup.value.filter((release) =>
    selectedType.value === 'All' || release.release_type === selectedType.value,
  ),
)

// Reset a type that does not exist for the selected group (or in a shared URL).
function ensureValidType() {
  if (selectedType.value === 'All') return
  const available = releasesInGroup.value.some(release => release.release_type === selectedType.value)
  if (!available) selectedType.value = 'All'
}

watch(selectedGroup, ensureValidType)
watch(releases, ensureValidType)

type SortOption = 'newest' | 'oldest' | 'most_cards'

const SORT_OPTIONS_RELEASES: { value: SortOption; labelKey: string }[] = [
  { value: 'newest', labelKey: 'releases.timeline.sortNewest' },
  { value: 'oldest', labelKey: 'releases.timeline.sortOldest' },
  { value: 'most_cards', labelKey: 'releases.timeline.sortMostCards' },
]

const selectedSort = ref<SortOption>(
  (['newest', 'oldest', 'most_cards'] as SortOption[]).includes(route.query.sort as SortOption)
    ? (route.query.sort as SortOption)
    : 'newest',
)

// Keep the filter + sort state in the URL so a filtered/sorted timeline can be shared.
watch([selectedGroup, selectedType, selectedSort], ([group, type, sort]) => {
  const query: Record<string, string> = {}
  if (group !== 'All') query.group = group
  if (type !== 'All') query.type = type
  if (sort !== 'newest') query.sort = sort
  router.replace({ query })
})

// Neither watcher above runs on its own during setup, so `?type=` was never
// validated on first paint: /releases?type=album (wrong case, or a type this
// group has no releases for) filtered everything out and rendered an empty
// timeline while the type chips beside it still displayed their counts — two
// halves of the same page disagreeing about what was selected. A hard load is
// exactly how a shared link arrives, which is the case the watchers could not
// reach.
//
// Placed after the watchers exist so a corrected value is written back into the
// URL too, and matched case-insensitively before giving up: a hand-typed
// lowercase type still selects the real one rather than widening to everything.
//
// Deliberately left alone when the timeline is empty because the fetch failed.
// Releases would be blank then, and resetting on that would discard the filter
// the link asked for while the error state — not a filter mismatch — is what is
// actually on screen.
if (selectedType.value !== 'All') {
  const available = releasesInGroup.value
    .map(release => release.release_type)
    .filter(Boolean) as string[]
  const match = available.find(type => type.toLowerCase() === selectedType.value.toLowerCase())
  if (match) selectedType.value = match
  else if (releases.value.length) selectedType.value = 'All'
}

/**
 * Apply sort to the filtered releases before bucketing into years.
 * The API already returns newest-first, so 'newest' is essentially a no-op —
 * but we re-sort explicitly so switching between options is always correct.
 */
const sortedFiltered = computed(() => {
  const list = [...filtered.value]
  if (selectedSort.value === 'most_cards') {
    return list.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
  }
  if (selectedSort.value === 'oldest') {
    return list.sort((a, b) => {
      if (a.release_date && b.release_date) return a.release_date < b.release_date ? -1 : a.release_date > b.release_date ? 1 : 0
      if (a.release_date) return -1
      if (b.release_date) return 1
      return (a.count ?? 0) - (b.count ?? 0)
    })
  }
  // newest (default)
  return list.sort((a, b) => {
    if (a.release_date && b.release_date) return a.release_date < b.release_date ? 1 : a.release_date > b.release_date ? -1 : 0
    if (a.release_date) return -1
    if (b.release_date) return 1
    return (b.count ?? 0) - (a.count ?? 0)
  })
})

const years = computed(() => {
  // For 'most_cards' sort, group all into one flat list instead of year buckets
  // so the ranking is obvious and not fragmented per year.
  if (selectedSort.value === 'most_cards') return []

  const buckets = new Map<string, any[]>()
  for (const release of sortedFiltered.value) {
    if (!release.release_date) continue
    const year = String(release.release_date).slice(0, 4)
    if (!buckets.has(year)) buckets.set(year, [])
    buckets.get(year)!.push(release)
  }
  const sorted = [...buckets.entries()]
  if (selectedSort.value === 'oldest') sorted.sort((a, b) => Number(a[0]) - Number(b[0]))
  else sorted.sort((a, b) => Number(b[0]) - Number(a[0]))
  return sorted.map(([year, items]) => ({ year, items }))
})

const undated = computed(() => sortedFiltered.value.filter(release => !release.release_date))

const datedCount = computed(() => sortedFiltered.value.length - undated.value.length)

function formatDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function albumPath(release: any) {
  return `/releases/${encodeURIComponent(release.group_name)}/${release.slug}`
}

/**
 * Both cover slots here are 48/56 px thumbnails, not artwork cards.
 *
 * Falls back to the CloudFront card image when a release has no artwork —
 * artworkSrcset returns undefined for that URL because it lacks the Apple size
 * suffix, so without this the fallback would ship unoptimized. `sizes` still
 * fits: it describes the box, which is the same either way.
 */
function artThumbSrcset(release: { artwork?: string | null, image?: string | null }) {
  return artworkSrcset(release.artwork, ART_THUMB_WIDTHS) ?? gridSrcset(release.image)
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader active="releases" />

    <main>
      <!-- Header -->
      <section class="border-b border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-8 sm:py-10">
          <p class="eyebrow">{{ t('releases.timeline.eyebrow') }}</p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{{ t('nav.releases') }}</h1>
          <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {{ t('releases.timeline.desc') }}
          </p>

          <div v-if="!loading && !loadError" class="mt-5 flex flex-col gap-3">
            <div class="flex flex-wrap gap-2">
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
                  {{ tab === 'All' ? t('browse.memberChipAll') : tab }}
                </span>
              </button>
            </div>

            <div v-if="typeTabs.length > 1 || selectedType !== 'All'" class="flex flex-wrap items-center gap-2">
              <span class="mr-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{{ t('card.type') }}</span>
              <button
                v-for="tab in typeTabs"
                :key="tab.type"
                type="button"
                class="rounded-lg border px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="
                  selectedType === tab.type
                    ? 'border-border bg-muted text-foreground'
                    : 'border-zinc-200 bg-card text-muted-foreground hover:border-zinc-300 hover:text-foreground dark:border-zinc-800 dark:hover:border-zinc-700'
                "
                :aria-pressed="selectedType === tab.type"
                @click="selectedType = tab.type"
              >
                {{ tab.type === 'All' ? t('browse.memberChipAll') : tab.type }}
                <span class="ml-1 tabular-nums text-muted-foreground">{{ tab.count }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Error -->
      <div v-if="loadError && !loading" class="page-shell py-8">
        <div class="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/40" role="alert">
          <div class="flex items-start gap-2.5">
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p class="text-sm font-medium text-red-900 dark:text-red-200">{{ t('releases.timeline.error') }}</p>
          </div>
          <Button variant="outline" size="sm" class="rounded-lg" @click="load">{{ t('browse.error.retry') }}</Button>
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
          {{ datedCount }} {{ datedCount === 1 ? t('releases.timeline.datedOne') : t('releases.timeline.datedMany') }}
          <span v-if="undated.length"> · {{ undated.length }} {{ t('releases.timeline.undatedSuffix') }}</span>
        </p>

        <section v-for="group in years" :key="group.year" class="mb-9">
          <div class="mb-1 flex items-baseline gap-3">
            <h2 class="border-l-4 border-foreground pl-3 text-2xl font-bold tracking-tight text-foreground">{{ group.year }}</h2>
            <span class="text-xs text-muted-foreground tabular-nums">
              {{ group.items.length }} {{ group.items.length === 1 ? t('releases.timeline.yearOne') : t('releases.timeline.yearMany') }}
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

              <span class="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-zinc-200 bg-muted dark:ring-zinc-800 sm:h-14 sm:w-14">
                <img
                  v-if="release.artwork || release.image"
                  :src="release.artwork || release.image"
                  :srcset="artThumbSrcset(release)"
                  sizes="(min-width: 640px) 56px, 48px"
                  :alt="t('releases.timeline.coverAlt', { name: release.release_name })"
                  loading="lazy"
                  decoding="async"
                  @error="onImageError"
                  class="h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.03]"
                />
                <Music2
                  v-else
                  class="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>

              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span class="h-2 w-2 shrink-0 rounded-full" :class="groupDot(release.group_name)" aria-hidden="true" />
                  <span class="truncate text-sm font-semibold text-foreground">{{ release.release_name }}</span>
                </span>
                <span class="mt-1 block truncate text-xs text-muted-foreground">
                  {{ release.group_name }}<template v-if="release.release_type"> · {{ release.release_type }}</template>
                  <template v-if="release.count > 0"> · {{ fmt(release.count) }} {{ t('releases.cards') }}</template>
                  <template v-else> · {{ t('releases.noCardsYet') }}</template>
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
            <h2 class="border-l-4 border-foreground pl-3 text-2xl font-bold tracking-tight text-foreground">{{ t('releases.timeline.datePending') }}</h2>
            <span class="text-xs text-muted-foreground tabular-nums">
              {{ undated.length }} {{ undated.length === 1 ? t('releases.timeline.yearOne') : t('releases.timeline.yearMany') }}
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

              <span class="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-zinc-200 bg-muted dark:ring-zinc-800 sm:h-14 sm:w-14">
                <img
                  v-if="release.artwork || release.image"
                  :src="release.artwork || release.image"
                  :srcset="artThumbSrcset(release)"
                  sizes="(min-width: 640px) 56px, 48px"
                  :alt="t('releases.timeline.coverAlt', { name: release.release_name })"
                  loading="lazy"
                  decoding="async"
                  @error="onImageError"
                  class="h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.03]"
                />
                <Music2
                  v-else
                  class="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>

              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span class="h-2 w-2 shrink-0 rounded-full" :class="groupDot(release.group_name)" aria-hidden="true" />
                  <span class="truncate text-sm font-semibold text-foreground">{{ release.release_name }}</span>
                </span>
                <span class="mt-1 block truncate text-xs text-muted-foreground">
                  {{ release.group_name }}<template v-if="release.release_type"> · {{ release.release_type }}</template>
                  <template v-if="release.count > 0"> · {{ fmt(release.count) }} {{ t('releases.cards') }}</template>
                  <template v-else> · {{ t('releases.noCardsYet') }}</template>
                </span>
              </span>

              <ArrowRight class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </NuxtLink>
          </div>
        </section>
      </div>

      <!-- Empty -->
      <div v-else class="page-shell py-10">
        <div class="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Music2 class="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <p class="mt-4 text-sm font-medium text-foreground">{{ t('releases.timeline.empty') }}</p>
          <p class="mt-1 text-sm text-muted-foreground">{{ t('empty.hint') }}</p>
        </div>
      </div>
    </main>

    <SiteFooter />
    <BackToTop />
    <MobileTabBar />
  </div>
</template>
