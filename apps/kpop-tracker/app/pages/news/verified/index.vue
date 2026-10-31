<script setup lang="ts">
import { AlertCircle, ArrowRight, BadgeCheck, Newspaper, Search } from 'lucide-vue-next'
import { groupDot } from '@/lib/catalog'

useHead({ title: 'News — HIBIKISHOP PC' })
useSeoMeta({
  ogTitle: 'News — HIBIKISHOP PC',
  ogDescription: 'Verified K-pop news for aespa, Hearts2Hearts and IVE — every story passes the source, corroboration, visual evidence, consistency, date and transparency checks before it is published.',
  ogUrl: 'https://kpop-tracker-six.vercel.app/news',
})

const { t, fmt, locale, setLocale } = useLocale()
const route = useRoute()
const router = useRouter()

/**
 * Display language for the feed: it follows the site locale (EN/ID), and the
 * segmented control below is the site switcher — one language decision for the
 * whole page. The API answers with the original wording whenever a machine
 * translation is missing, so this can never blank a headline.
 */
const lang = computed<'en' | 'id'>(() => (locale.value === 'id' ? 'id' : 'en'))
const LANG_OPTIONS: ReadonlyArray<'en' | 'id'> = ['en', 'id']

const ARTISTS = [
  { id: 'aespa', name: 'aespa' },
  { id: 'hearts2hearts', name: 'Hearts2Hearts' },
  { id: 'ive', name: 'IVE' },
]
const ARTIST_IDS = ARTISTS.map(entry => entry.id)
const ARTIST_NAME: Record<string, string> = Object.fromEntries(ARTISTS.map(entry => [entry.id, entry.name]))

const CATEGORIES = [
  'release', 'schedule', 'performance', 'award', 'chart',
  'business', 'media', 'personnel', 'other',
]
const COMPONENTS = ['source', 'corroboration', 'visual', 'consistency', 'date', 'transparency'] as const
const COMPONENT_MAX: Record<(typeof COMPONENTS)[number], number> = {
  source: 25, corroboration: 25, visual: 20, consistency: 15, date: 10, transparency: 5,
}

function queryText(name: string): string {
  const raw = route.query[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : ''
}

const artist = ref(ARTIST_IDS.includes(queryText('artist')) ? queryText('artist') : 'all')
const category = ref(CATEGORIES.includes(queryText('category')) ? queryText('category') : 'all')
const publisher = ref(queryText('publisher') || 'all')
const search = ref(queryText('q'))
const searchInput = ref(search.value)
const page = ref(Math.max(1, Number(queryText('page')) || 1))

// The feed and the source registry ship with the SSR HTML; filters re-fetch on
// the client. Neither handler throws — an unreachable API renders the error
// state, it never aborts the page.
const feedAsync = useAsyncData(
  'news:feed',
  () => $fetch<any>('/api/news', {
    query: {
      artist: artist.value === 'all' ? '' : artist.value,
      category: category.value === 'all' ? '' : category.value,
      publisher: publisher.value === 'all' ? '' : publisher.value,
      q: search.value,
      page: page.value,
      limit: 12,
      lang: lang.value,
    },
  }).catch(() => null),
  { watch: [artist, category, publisher, search, page, lang] },
)
const sourcesAsync = useAsyncData(
  'news:sources',
  () => $fetch<any>('/api/news/sources').catch(() => null),
)

await Promise.all([feedAsync, sourcesAsync])

const { data: feedRes, pending: loading, refresh: reload } = feedAsync
const { data: sourcesRes } = sourcesAsync

const articles = computed<any[]>(() => feedRes.value?.data || [])
const meta = computed(() => feedRes.value?.meta || { page: 1, pages: 1, total: 0, limit: 12 })
const loadError = computed(() => feedRes.value == null)

const publishers = computed<any[]>(() => sourcesRes.value?.publishers || [])
const policy = computed(() => sourcesRes.value?.policy || { min_score: 90, hard_gates: 12 })

const resultCount = computed(() => meta.value.total)
const countLabel = computed(() =>
  resultCount.value === 1 ? t('news.resultsOne') : t('news.resultsMany'),
)

// Debounced search: typing must not fire a request per keystroke.
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchInput, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    search.value = value.trim()
    page.value = 1
  }, 300)
})

// A different filter means page 1 again (no-op when it is already 1, so this
// does not trigger a second fetch).
watch([artist, category, publisher], () => {
  if (page.value !== 1) page.value = 1
})

// Keep the URL shareable, exactly like the releases timeline does.
watch([artist, category, publisher, search, page], () => {
  const query: Record<string, string> = {}
  if (artist.value !== 'all') query.artist = artist.value
  if (category.value !== 'all') query.category = category.value
  if (publisher.value !== 'all') query.publisher = publisher.value
  if (search.value) query.q = search.value
  if (page.value > 1) query.page = String(page.value)
  router.replace({ query })
})

function artistName(id: string): string {
  return ARTIST_NAME[id] || id
}

function onCategory(value: unknown) {
  category.value = String(value ?? 'all')
}

function onPublisher(value: unknown) {
  publisher.value = String(value ?? 'all')
}

function categoryLabel(categoryId: string): string {
  return t(`news.category.${categoryId}`)
}

/** Date-only values are printed as written; timestamps render in WIB. */
function formatDate(article: any): string {
  const value = article?.published_at
  if (!value) return ''
  const hasTime = typeof value === 'string' && value.length > 10
  const date = new Date(hasTime ? value : `${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(locale.value === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: hasTime ? 'Asia/Jakarta' : 'UTC',
  }).format(date)
}

function hideBrokenImage(event: Event) {
  const img = event.currentTarget as HTMLImageElement | null
  if (img) img.style.display = 'none'
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader active="news" />

    <main>
      <!-- Header + filters -->
      <section class="border-b border-border">
        <div class="page-shell py-8 sm:py-10">
          <p class="eyebrow">{{ t('news.eyebrow') }}</p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{{ t('news.title') }}</h1>
          <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {{ t('news.desc') }}
          </p>

          <div class="mt-5 flex flex-col gap-3">
            <!-- Artist filter -->
            <div class="flex flex-wrap items-center gap-2">
              <span class="mr-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{{ t('news.filterArtist') }}</span>
              <button
                type="button"
                class="rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="artist === 'all'
                  ? 'border-border bg-muted text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground'"
                :aria-pressed="artist === 'all'"
                @click="artist = 'all'"
              >
                {{ t('news.allArtists') }}
              </button>
              <button
                v-for="entry in ARTISTS"
                :key="entry.id"
                type="button"
                class="rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="artist === entry.id
                  ? 'border-border bg-muted text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground'"
                :aria-pressed="artist === entry.id"
                @click="artist = entry.id"
              >
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-1.5 w-1.5 rounded-full" :class="groupDot(entry.name)" />
                  {{ entry.name }}
                </span>
              </button>
            </div>

            <!-- Article language (EN / ID) — same decision as the site locale -->
            <div class="flex flex-wrap items-center gap-2">
              <span class="mr-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{{ t('news.filterLang') }}</span>
              <div class="inline-flex overflow-hidden rounded-lg border border-border">
                <button
                  v-for="option in LANG_OPTIONS"
                  :key="option"
                  type="button"
                  class="px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :class="lang === option
                    ? 'bg-muted text-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground'"
                  :aria-pressed="lang === option"
                  @click="setLocale(option)"
                >
                  {{ option === 'en' ? 'English' : 'Bahasa Indonesia' }}
                </button>
              </div>
              <span class="text-[11px] text-muted-foreground">{{ t('news.langNote') }}</span>
            </div>

            <!-- Search + category + publisher -->
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  v-model="searchInput"
                  type="search"
                  :placeholder="t('news.searchPlaceholder')"
                  :aria-label="t('aria.newsSearch')"
                  class="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring dark:bg-muted/60"
                />
              </div>

              <Select :model-value="category" @update:model-value="onCategory">
                <SelectTrigger
                  class="h-9 w-full rounded-lg border-border bg-card text-sm sm:w-48"
                  :aria-label="t('news.filterCategory')"
                >
                  <SelectValue class="min-w-0 truncate" />
                </SelectTrigger>
                <SelectContent class="max-w-[calc(100vw-2rem)]">
                  <SelectItem value="all">{{ t('news.allCategories') }}</SelectItem>
                  <SelectItem v-for="entry in CATEGORIES" :key="entry" :value="entry">
                    {{ categoryLabel(entry) }}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                v-if="publishers.length > 0"
                :model-value="publisher"
                @update:model-value="onPublisher"
              >
                <SelectTrigger
                  class="h-9 w-full rounded-lg border-border bg-card text-sm sm:w-52"
                  :aria-label="t('news.filterPublisher')"
                >
                  <SelectValue class="min-w-0 truncate" />
                </SelectTrigger>
                <SelectContent class="max-w-[calc(100vw-2rem)]">
                  <SelectItem value="all">{{ t('news.allPublishers') }}</SelectItem>
                  <SelectItem v-for="entry in publishers" :key="entry.domain" :value="entry.domain">
                    {{ entry.name }} ({{ entry.count }})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </section>

      <!-- Error -->
      <div v-if="loadError && !loading" class="page-shell py-8">
        <div class="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/40" role="alert">
          <div class="flex items-start gap-2.5">
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p class="text-sm font-medium text-red-900 dark:text-red-200">{{ t('news.error.title') }}</p>
              <p class="text-xs text-red-700 dark:text-red-300">{{ t('news.error.hint') }}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" class="rounded-lg" @click="reload">{{ t('news.error.retry') }}</Button>
        </div>
      </div>

      <!-- Loading (only before the first payload — filters keep the list visible) -->
      <div v-else-if="loading && articles.length === 0" class="page-shell py-8">
        <p class="mb-4 text-xs text-muted-foreground">{{ t('news.loading') }}</p>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div v-for="i in 6" :key="i" class="overflow-hidden rounded-xl border border-border bg-card">
            <div class="skeleton-block h-32 w-full" />
            <div class="space-y-2 p-4">
              <div class="skeleton-block h-3 w-1/3" />
              <div class="skeleton-block h-4 w-3/4" />
              <div class="skeleton-block h-3 w-2/3" />
            </div>
          </div>
        </div>
      </div>

      <!-- Feed -->
      <div v-else-if="articles.length > 0" class="page-shell py-6 sm:py-8">
        <div class="mb-5 flex flex-wrap items-center justify-between gap-2">
          <p class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <BadgeCheck class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            {{ t('news.onlyVerified') }}
          </p>
          <p class="text-xs tabular-nums text-muted-foreground">
            {{ fmt(resultCount) }} {{ countLabel }}
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="article in articles"
            :key="article.id"
            class="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors duration-150 hover:border-border-strong"
          >
            <!-- Evidence preview (linked asset, never rehosted) -->
            <div v-if="article.thumbnail" class="relative h-32 w-full overflow-hidden bg-muted">
              <img
                :src="article.thumbnail"
                alt=""
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                class="h-full w-full object-cover transition-transform duration-200"
                @error="hideBrokenImage"
              />
              <span class="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 shadow-sm dark:text-emerald-400">
                <BadgeCheck class="h-3 w-3" aria-hidden="true" />
                {{ t('news.verified') }}
              </span>
            </div>

            <div class="flex flex-1 flex-col gap-2 p-4">
              <div class="flex flex-wrap items-center gap-2 text-[11px]">
                <span class="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <span class="h-1.5 w-1.5 rounded-full" :class="groupDot(artistName(article.artist_id))" aria-hidden="true" />
                  {{ artistName(article.artist_id) }}
                </span>
                <span class="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">{{ categoryLabel(article.category) }}</span>
                <span
                  v-if="!article.thumbnail"
                  class="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400"
                >
                  <BadgeCheck class="h-3 w-3" aria-hidden="true" />
                  {{ t('news.verified') }}
                </span>
              </div>

              <h2 class="text-sm font-semibold leading-snug text-foreground">
                <NuxtLink :to="`/news/verified/${article.id}`" class="hover:underline">{{ article.title }}</NuxtLink>
              </h2>

              <p
                v-if="article.translated && article.original_title && article.original_title !== article.title"
                class="text-[11px] italic leading-relaxed text-muted-foreground"
              >
                <span class="not-italic rounded-md bg-muted px-1.5 py-0.5 font-medium">{{ t('news.translated') }}</span>
                {{ t('news.originalTitle', { title: article.original_title }) }}
              </p>

              <p v-if="article.summary" class="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {{ article.summary }}
              </p>

              <div class="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-[11px] text-muted-foreground">
                <span v-if="article.publisher_name || article.publisher_domain" class="font-medium text-foreground/80">
                  {{ article.publisher_name || article.publisher_domain }}
                </span>
                <time v-if="article.published_at" :datetime="article.published_at">{{ formatDate(article) }}</time>
                <span v-if="article.evidence_count > 0" class="tabular-nums">
                  · {{ article.evidence_count }} {{ t('news.evidenceCount') }}
                </span>
              </div>

              <div class="mt-2 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span
                  class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold tabular-nums text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                  :aria-label="t('news.scoreAria', { score: article.verification_score })"
                >
                  <BadgeCheck class="h-3 w-3" aria-hidden="true" />
                  {{ t('news.score', { score: article.verification_score }) }}
                </span>
                <span class="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                  <NuxtLink :to="`/news/verified/${article.id}`" class="hover:underline">{{ t('news.details') }}</NuxtLink>
                  <ArrowRight class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </span>
              </div>
            </div>
          </article>
        </div>

        <!-- Pagination -->
        <div v-if="meta.pages > 1" class="mt-8 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            class="rounded-lg"
            :disabled="meta.page <= 1 || loading"
            @click="page = meta.page - 1"
          >
            {{ t('news.prev') }}
          </Button>
          <span class="text-xs tabular-nums text-muted-foreground">
            {{ t('news.pageOf', { current: meta.page, total: meta.pages }) }}
          </span>
          <Button
            variant="outline"
            size="sm"
            class="rounded-lg"
            :disabled="meta.page >= meta.pages || loading"
            @click="page = meta.page + 1"
          >
            {{ t('news.next') }}
          </Button>
        </div>

        <!-- Scoring transparency -->
        <details class="mt-8 overflow-hidden rounded-xl border border-border bg-card">
          <summary class="cursor-pointer select-none px-4 py-3 text-sm font-medium text-foreground">
            {{ t('news.scoringTitle') }}
          </summary>
          <div class="border-t border-border px-4 py-4">
            <p class="text-xs leading-relaxed text-muted-foreground">
              {{ t('news.scoringDesc', { gates: policy.hard_gates, min: policy.min_score }) }}
            </p>
            <ul class="mt-3 grid gap-2 sm:grid-cols-2">
              <li
                v-for="component in COMPONENTS"
                :key="component"
                class="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span class="text-xs font-medium text-foreground">{{ t(`news.component.${component}`) }}</span>
                <span class="text-xs tabular-nums text-muted-foreground">{{ t('news.componentMax', { max: COMPONENT_MAX[component] }) }}</span>
              </li>
            </ul>
          </div>
        </details>
      </div>

      <!-- Empty -->
      <div v-else class="page-shell py-10">
        <div class="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Newspaper class="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <p class="mt-4 text-sm font-medium text-foreground">{{ t('news.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted-foreground">{{ t('news.empty.hint') }}</p>
        </div>
      </div>
    </main>

    <SiteFooter />
    <BackToTop />
    <MobileTabBar />
  </div>
</template>
