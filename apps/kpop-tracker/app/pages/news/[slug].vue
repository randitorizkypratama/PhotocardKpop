<script setup lang="ts">
import { AlertCircle, ArrowLeft, CalendarDays, Clock, ExternalLink, FileText, Images, ShieldCheck } from 'lucide-vue-next'
import { groupDot } from '@/lib/catalog'
import { renderMarkdown } from '@/lib/markdown'

const route = useRoute()
const slug = String(route.params.slug || '')
const { t } = useLocale()

const ARTIST_NAME: Record<string, string> = {
  aespa: 'aespa',
  hearts2hearts: 'Hearts2Hearts',
  ive: 'IVE',
}

// A 404 (withdrawn, unpublished, unknown slug) is carried through as
// `notFound` so it renders "not available" rather than the retryable error.
const detailAsync = useAsyncData(
  `news:article:${slug}`,
  () => $fetch<any>(`/api/news/articles/${encodeURIComponent(slug)}`)
    .catch((e: any) => (e?.statusCode === 404
      ? { success: false, notFound: true, data: null }
      : null)),
)
await detailAsync

const { data: detailRes, pending: loading, refresh: reload } = detailAsync

const article = computed<any | null>(() => detailRes.value?.data || null)
const notFound = computed(() =>
  detailRes.value?.notFound === true
  || (detailRes.value != null && (!detailRes.value.success || !detailRes.value.data)),
)
const loadError = computed(() => detailRes.value == null)

const artistId = computed(() => String(article.value?.artist_id || ''))
const artistName = computed(() => ARTIST_NAME[artistId.value] || artistId.value)
const images = computed<any[]>(() => article.value?.images || [])
const hero = computed<any | null>(() => images.value[0] || null)
const gallery = computed<any[]>(() => images.value.slice(1))
const sources = computed<any[]>(() => article.value?.sources || [])
const bodyHtml = computed(() => renderMarkdown(article.value?.body_markdown || ''))

useHead({
  title: computed(() => (article.value ? `${article.value.title} — HIBIKISHOP PC` : 'Berita K-Pop — HIBIKISHOP PC')),
})
useSeoMeta({
  ogTitle: computed(() => article.value?.title || 'Berita K-Pop'),
  ogDescription: computed(() => article.value?.dek || 'Artikel blog fanbase K-Pop.'),
  ogUrl: computed(() => `https://kpop-tracker-six.vercel.app/news/${encodeURIComponent(slug)}`),
  ogImage: computed(() => hero.value?.image_url || 'https://kpop-tracker-six.vercel.app/hibikishop-logo.png'),
})
// Structured data for the article itself (§SEO).
useHead(() => ({
  script: article.value
    ? [{
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: article.value.title,
          description: article.value.dek,
          inLanguage: 'id',
          datePublished: article.value.published_at || undefined,
          image: hero.value?.image_url ? [hero.value.image_url] : undefined,
          articleSection: article.value.category,
          url: `https://kpop-tracker-six.vercel.app/news/${article.value.slug}`,
        }),
      }]
    : [],
}))

/** Date-only stays a date; a timestamp renders in WIB. */
function formatDate(value: string | null): string {
  if (!value) return ''
  const hasTime = value.length > 10
  const date = new Date(hasTime ? value : `${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
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
    <AppHeader active="news" back />

    <main>
      <!-- Loading -->
      <div v-if="loading && !article" class="page-shell py-8">
        <div class="space-y-3">
          <div class="skeleton-block h-4 w-32" />
          <div class="skeleton-block h-8 w-3/4" />
          <div class="skeleton-block h-3.5 w-2/3" />
          <div class="skeleton-block h-64 w-full rounded-xl" />
        </div>
      </div>

      <!-- Not found -->
      <div v-else-if="notFound" class="page-shell py-12">
        <div class="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <ShieldCheck class="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <p class="mt-4 text-sm font-medium text-foreground">{{ t('news.blog.notFound') }}</p>
          <p class="mt-1 text-sm text-muted-foreground">{{ t('news.blog.notFoundHint') }}</p>
          <Button variant="outline" size="sm" class="mt-5 rounded-lg" as-child>
            <NuxtLink to="/news">
              <ArrowLeft class="mr-1.5 h-4 w-4" />
              {{ t('news.blog.back') }}
            </NuxtLink>
          </Button>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="loadError" class="page-shell py-8">
        <div class="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/40" role="alert">
          <div class="flex items-start gap-2.5">
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p class="text-sm font-medium text-red-900 dark:text-red-200">{{ t('news.blog.error.title') }}</p>
          </div>
          <Button variant="outline" size="sm" class="rounded-lg" @click="reload">{{ t('news.error.retry') }}</Button>
        </div>
      </div>

      <!-- Article -->
      <template v-else-if="article">
        <article>
          <section class="border-b border-border">
            <div class="page-shell py-8 sm:py-10">
              <NuxtLink to="/news" class="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" />
                {{ t('news.blog.back') }}
              </NuxtLink>

              <div class="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span class="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <span class="h-2 w-2 rounded-full" :class="groupDot(artistName)" aria-hidden="true" />
                  {{ artistName }}
                </span>
                <span class="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{{ t(`news.category.${article.category}`) }}</span>
                <span v-if="article.published_at" class="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays class="h-3.5 w-3.5" aria-hidden="true" />
                  {{ formatDate(article.published_at) }}
                </span>
                <span class="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Clock class="h-3.5 w-3.5" aria-hidden="true" />
                  {{ t('news.blog.readTime', { minutes: article.reading_minutes }) }}
                </span>
              </div>

              <h1 class="mt-3 max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
                {{ article.title }}
              </h1>

              <p class="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {{ article.dek }}
              </p>
            </div>
          </section>

          <!-- Hero image, hotlinked and credited -->
          <figure v-if="hero" class="page-shell pt-6">
            <div class="overflow-hidden rounded-xl border border-border bg-muted">
              <img
                :src="hero.image_url"
                :alt="hero.caption || t('news.blog.heroAlt')"
                loading="eager"
                decoding="async"
                referrerpolicy="no-referrer"
                class="h-auto max-h-[520px] w-full object-cover"
                @error="hideBrokenImage"
              />
            </div>
            <figcaption class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span v-if="hero.caption">{{ hero.caption }}</span>
              <span v-if="hero.credit_text">
                {{ t('news.blog.credit', { credit: hero.credit_text }) }}
                <a
                  v-if="hero.credit_url"
                  :href="hero.credit_url"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  class="ml-1 underline hover:text-foreground"
                >{{ t('news.blog.creditLink') }}</a>
              </span>
            </figcaption>
          </figure>

          <div class="page-shell grid gap-8 py-8 lg:grid-cols-3">
            <!-- Body -->
            <div class="lg:col-span-2">
              <!-- eslint-disable-next-line vue/no-v-html -- escape-first renderer, see app/lib/markdown.ts -->
              <div class="article-body text-sm leading-relaxed text-foreground sm:text-[15px]" v-html="bodyHtml" />

              <!-- Remaining images -->
              <section v-if="gallery.length" class="mt-8">
                <h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Images class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {{ t('news.blog.photosTitle') }}
                </h2>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <figure v-for="(image, index) in gallery" :key="`${image.image_url}-${index}`" class="overflow-hidden rounded-lg border border-border">
                    <img
                      :src="image.image_url"
                      :alt="image.caption || article.title"
                      loading="lazy"
                      decoding="async"
                      referrerpolicy="no-referrer"
                      class="h-40 w-full object-cover"
                      @error="hideBrokenImage"
                    />
                    <figcaption class="space-y-1 p-3 text-[11px] text-muted-foreground">
                      <p v-if="image.caption">{{ image.caption }}</p>
                      <p v-if="image.credit_text">
                        {{ t('news.blog.credit', { credit: image.credit_text }) }}
                        <a
                          v-if="image.credit_url"
                          :href="image.credit_url"
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          class="ml-1 underline hover:text-foreground"
                        >{{ t('news.blog.creditLink') }}</a>
                      </p>
                    </figcaption>
                  </figure>
                </div>
              </section>
            </div>

            <!-- Sources + transparency -->
            <aside class="space-y-6">
              <section class="rounded-xl border border-border bg-card p-4">
                <h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileText class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {{ t('news.blog.sourceTitle') }}
                </h2>
                <p class="mt-1 text-[11px] leading-relaxed text-muted-foreground">{{ t('news.blog.sourceDesc') }}</p>

                <p v-if="sources.length === 0" class="mt-3 text-xs text-muted-foreground">{{ t('news.blog.sourcesEmpty') }}</p>
                <ul v-else class="mt-3 space-y-2">
                  <li v-for="(source, index) in sources" :key="`${source.source_url}-${index}`" class="rounded-lg border border-border px-3 py-2">
                    <p class="text-xs font-medium text-foreground">{{ source.publisher_name || source.publisher_domain || source.source_url }}</p>
                    <p v-if="source.original_title" class="mt-0.5 text-[11px] leading-snug text-muted-foreground">{{ source.original_title }}</p>
                    <a
                      :href="source.source_url"
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      class="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
                    >
                      {{ t('news.blog.originalArticle') }}
                      <ExternalLink class="h-3 w-3" aria-hidden="true" />
                    </a>
                  </li>
                </ul>
              </section>

              <section v-if="article.transparency" class="rounded-xl border border-border bg-muted/40 p-4">
                <h2 class="text-sm font-semibold text-foreground">{{ t('news.blog.transparencyTitle') }}</h2>
                <p class="mt-1 text-[11px] leading-relaxed text-muted-foreground">{{ t('news.blog.transparencyDesc') }}</p>
                <dl class="mt-3 space-y-1.5 text-xs">
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">{{ t('news.blog.verificationStatus') }}</dt>
                    <dd class="font-medium tabular-nums text-foreground">{{ article.transparency.verification_status || '—' }}</dd>
                  </div>
                  <div class="flex justify-between gap-3">
                    <dt class="text-muted-foreground">{{ t('news.blog.verificationScore') }}</dt>
                    <dd class="font-medium tabular-nums text-foreground">
                      {{ article.transparency.verification_score == null ? '—' : `${article.transparency.verification_score}/100` }}
                    </dd>
                  </div>
                </dl>
              </section>
            </aside>
          </div>
        </article>
      </template>
    </main>

    <SiteFooter />
    <BackToTop />
    <MobileTabBar />
  </div>
</template>

<style scoped>
.article-body :deep(p) {
  margin: 0 0 1rem;
}
.article-body :deep(h2),
.article-body :deep(h3),
.article-body :deep(h4) {
  margin: 1.5rem 0 0.75rem;
  font-weight: 600;
  line-height: 1.35;
  color: hsl(var(--foreground));
}
.article-body :deep(h2) {
  font-size: 1.125rem;
}
.article-body :deep(h3),
.article-body :deep(h4) {
  font-size: 1rem;
}
.article-body :deep(ul) {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
  list-style: disc;
}
.article-body :deep(li) {
  margin-bottom: 0.375rem;
}
.article-body :deep(strong) {
  font-weight: 600;
}
.article-body :deep(code) {
  border-radius: 0.25rem;
  background: hsl(var(--muted));
  padding: 0.1rem 0.3rem;
  font-size: 0.85em;
}
</style>
