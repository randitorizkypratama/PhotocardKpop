<script setup lang="ts">
import { AlertCircle, ArrowRight, Clock, Newspaper, Search } from 'lucide-vue-next'
import { groupDot } from '@/lib/catalog'

useHead({ title: 'Berita K-Pop — HIBIKISHOP PC' })
useSeoMeta({
  ogTitle: 'Berita K-Pop — HIBIKISHOP PC',
  ogDescription: 'Artikel blog fanbase untuk aespa, Hearts2Hearts dan IVE — ditulis ulang dalam bahasa Indonesia lengkap dengan kredit foto dan daftar sumber.',
  ogUrl: 'https://kpop-tracker-six.vercel.app/news',
})

const { t, fmt } = useLocale()
const route = useRoute()
const router = useRouter()

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

function queryText(name: string): string {
  const raw = route.query[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : ''
}

const artist = ref(ARTIST_IDS.includes(queryText('artist')) ? queryText('artist') : 'all')
const category = ref(CATEGORIES.includes(queryText('category')) ? queryText('category') : 'all')
const search = ref(queryText('q'))
const searchInput = ref(search.value)
const page = ref(Math.max(1, Number(queryText('page')) || 1))

// The feed ships with the SSR HTML; filters re-fetch on the client. The handler
// swallows its own failure so an unreachable API renders the error state.
const feedAsync = useAsyncData(
  'news:articles',
  () => $fetch<any>('/api/news/articles', {
    query: {
      artist: artist.value === 'all' ? '' : artist.value,
      category: category.value === 'all' ? '' : category.value,
      q: search.value,
      page: page.value,
      limit: 12,
    },
  }).catch(() => null),
  { watch: [artist, category, search, page] },
)

await feedAsync

const { data: feedRes, pending: loading, refresh: reload } = feedAsync

const articles = computed<any[]>(() => feedRes.value?.data || [])
const meta = computed(() => feedRes.value?.meta || { page: 1, pages: 1, total: 0, limit: 12 })
const loadError = computed(() => feedRes.value == null)
const resultCount = computed(() => meta.value.total)

// Debounced search: typing must not fire a request per keystroke.
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchInput, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    search.value = value.trim()
    page.value = 1
  }, 300)
})

watch([artist, category], () => {
  if (page.value !== 1) page.value = 1
})

watch([artist, category, search, page], () => {
  const query: Record<string, string> = {}
  if (artist.value !== 'all') query.artist = artist.value
  if (category.value !== 'all') query.category = category.value
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
  return new Intl.DateTimeFormat('id-ID', {
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
      <section class="border-b border-border">
        <div class="page-shell py-8 sm:py-10">
          <p class="eyebrow">{{ t('news.blog.eyebrow') }}</p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{{ t('news.blog.title') }}</h1>
          <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{{ t('news.blog.desc') }}</p>

          <!-- Tier switcher: the blog is the front page, the verified feed is one click away. -->
          <div class="mt-5 inline-flex overflow-hidden rounded-lg border border-border" role="tablist">
            <span
              class="px-3.5 py-1.5 text-sm font-medium bg-muted text-foreground"
              role="tab"
              aria-selected="true"
            >{{ t('news.blog.tabArticles') }}</span>
            <NuxtLink
              to="/news/verified"
              class="px-3.5 py-1.5 text-sm font-medium bg-card text-muted-foreground transition-colors hover:text-foreground"
              role="tab"
              aria-selected="false"
            >{{ t('news.blog.tabVerified') }}</NuxtLink>
          </div>

          <div class="mt-4 flex flex-col gap-3">
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

            <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  v-model="searchInput"
                  type="search"
                  :placeholder="t('news.blog.searchPlaceholder')"
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
              <p class="text-sm font-medium text-red-900 dark:text-red-200">{{ t('news.blog.error.title') }}</p>
              <p class="text-xs text-red-700 dark:text-red-300">{{ t('news.blog.error.hint') }}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" class="rounded-lg" @click="reload">{{ t('news.error.retry') }}</Button>
        </div>
      </div>

      <!-- Loading -->
      <div v-else-if="loading && articles.length === 0" class="page-shell py-8">
        <p class="mb-4 text-xs text-muted-foreground">{{ t('news.blog.loading') }}</p>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div v-for="i in 6" :key="i" class="overflow-hidden rounded-xl border border-border bg-card">
            <div class="skeleton-block h-40 w-full" />
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
        <p class="mb-5 text-xs tabular-nums text-muted-foreground">
          {{ fmt(resultCount) }} {{ t('news.blog.resultsMany') }}
        </p>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="article in articles"
            :key="article.id"
            class="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors duration-150 hover:border-border-strong"
          >
            <NuxtLink :to="`/news/${article.slug}`" class="block">
              <div v-if="article.thumbnail" class="relative h-40 w-full overflow-hidden bg-muted">
                <img
                  :src="article.thumbnail"
                  :alt="article.title"
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  class="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
                  @error="hideBrokenImage"
                />
              </div>
              <div v-else class="flex h-40 w-full items-center justify-center bg-muted">
                <Newspaper class="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              </div>
            </NuxtLink>

            <div class="flex flex-1 flex-col gap-2 p-4">
              <div class="flex flex-wrap items-center gap-2 text-[11px]">
                <span class="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <span class="h-1.5 w-1.5 rounded-full" :class="groupDot(artistName(article.artist_id))" aria-hidden="true" />
                  {{ artistName(article.artist_id) }}
                </span>
                <span class="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">{{ categoryLabel(article.category) }}</span>
              </div>

              <h2 class="text-base font-semibold leading-snug text-foreground">
                <NuxtLink :to="`/news/${article.slug}`" class="hover:underline">{{ article.title }}</NuxtLink>
              </h2>

              <p class="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{{ article.dek }}</p>

              <div class="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-[11px] text-muted-foreground">
                <time v-if="article.published_at" :datetime="article.published_at">{{ formatDate(article) }}</time>
                <span class="inline-flex items-center gap-1">
                  <Clock class="h-3 w-3" aria-hidden="true" />
                  {{ t('news.blog.readTime', { minutes: article.reading_minutes }) }}
                </span>
              </div>

              <div class="mt-2 border-t border-border pt-3">
                <NuxtLink
                  :to="`/news/${article.slug}`"
                  class="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
                >
                  {{ t('news.blog.readMore') }}
                  <ArrowRight class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </NuxtLink>
              </div>
            </div>
          </article>
        </div>

        <div v-if="meta.pages > 1" class="mt-8 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" class="rounded-lg" :disabled="meta.page <= 1 || loading" @click="page = meta.page - 1">
            {{ t('news.blog.prev') }}
          </Button>
          <span class="text-xs tabular-nums text-muted-foreground">
            {{ t('news.blog.pageOf', { current: meta.page, total: meta.pages }) }}
          </span>
          <Button variant="outline" size="sm" class="rounded-lg" :disabled="meta.page >= meta.pages || loading" @click="page = meta.page + 1">
            {{ t('news.blog.next') }}
          </Button>
        </div>
      </div>

      <!-- Empty -->
      <div v-else class="page-shell py-10">
        <div class="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Newspaper class="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <p class="mt-4 text-sm font-medium text-foreground">{{ t('news.blog.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted-foreground">{{ t('news.blog.empty.hint') }}</p>
        </div>
      </div>
    </main>

    <SiteFooter />
    <BackToTop />
    <MobileTabBar />
  </div>
</template>
