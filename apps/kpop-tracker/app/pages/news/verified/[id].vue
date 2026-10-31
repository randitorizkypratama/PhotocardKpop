<script setup lang="ts">
import { AlertCircle, ArrowLeft, BadgeCheck, CalendarDays, ExternalLink, FileText, Images, Quote, ShieldCheck } from 'lucide-vue-next'
import { groupDot } from '@/lib/catalog'

const route = useRoute()
const id = String(route.params.id || '')
const { t, locale } = useLocale()

/** Display language follows the site locale; a missing translation falls back
 * to the verified original wording, never to invented text. */
const lang = computed<'en' | 'id'>(() => (locale.value === 'id' ? 'id' : 'en'))

const ARTIST_NAME: Record<string, string> = {
  aespa: 'aespa',
  hearts2hearts: 'Hearts2Hearts',
  ive: 'IVE',
}

const COMPONENTS = ['source', 'corroboration', 'visual', 'consistency', 'date', 'transparency'] as const
const COMPONENT_MAX: Record<(typeof COMPONENTS)[number], number> = {
  source: 25, corroboration: 25, visual: 20, consistency: 15, date: 10, transparency: 5,
}

// A 404 (withdrawn, revoked, or never verified) is carried through as
// `notFound` so it renders "not available" instead of the retryable error.
const detailAsync = useAsyncData(
  `news:detail:${id}`,
  () => $fetch<any>(`/api/news/${encodeURIComponent(id)}`, { query: { lang: lang.value } })
    .catch((e: any) => (e?.statusCode === 404
      ? { success: false, notFound: true, data: null }
      : null)),
  { watch: [lang] },
)
await detailAsync

const { data: detailRes, pending: loading, refresh: reload } = detailAsync

const article = computed(() => detailRes.value?.data || null)
const notFound = computed(() =>
  detailRes.value?.notFound === true
  || (detailRes.value != null && (!detailRes.value.success || !detailRes.value.data)),
)
const loadError = computed(() => detailRes.value == null)

const artistId = computed(() => String(article.value?.artist_id || ''))
const artistName = computed(() => ARTIST_NAME[artistId.value] || artistId.value)
const score = computed(() => Number(article.value?.verification_score || 0))

const breakdown = computed(() => COMPONENTS.map((key) => ({
  key,
  points: Number(article.value?.score_breakdown?.[key] ?? 0),
  max: COMPONENT_MAX[key],
})))

const failedGates = computed<string[]>(() => article.value?.failed_gates || [])

const originalUrl = computed(() => String(article.value?.original_url || ''))

useHead({
  title: computed(() => article.value
    ? `${article.value.title} — Verified K-pop news`
    : 'News — HIBIKISHOP PC'),
})
useSeoMeta({
  ogTitle: computed(() => article.value?.title || 'Verified K-pop news'),
  ogDescription: computed(() => article.value?.summary || 'Verified K-pop news — published only after every hard gate passed.'),
  ogUrl: computed(() => `https://kpop-tracker-six.vercel.app/news/${encodeURIComponent(id)}`),
})

/** Date-only stays a date; a real timestamp renders in WIB. */
function formatDate(value: string | null, opts: { withTime?: boolean } = {}): string {
  if (!value) return ''
  const hasTime = value.length > 10
  const date = new Date(hasTime ? value : `${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  const format: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: hasTime ? 'Asia/Jakarta' : 'UTC',
  }
  if (opts.withTime && hasTime) {
    format.hour = '2-digit'
    format.minute = '2-digit'
  }
  return new Intl.DateTimeFormat(locale.value === 'id' ? 'id-ID' : 'en-GB', format).format(date)
}

function hideBrokenImage(event: Event) {
  const img = event.currentTarget as HTMLImageElement | null
  if (img) img.style.display = 'none'
}

function evidenceLabel(type: string): string {
  return t(`news.detail.evidence.${type}`)
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader active="news" back />

    <main>
      <!-- Loading -->
      <div v-if="loading && !article" class="page-shell py-8">
        <p class="mb-4 text-xs text-muted-foreground">{{ t('news.detail.loading') }}</p>
        <div class="space-y-3">
          <div class="skeleton-block h-4 w-32" />
          <div class="skeleton-block h-8 w-3/4" />
          <div class="skeleton-block h-3.5 w-2/3" />
          <div class="skeleton-block h-40 w-full rounded-xl" />
        </div>
      </div>

      <!-- Not found -->
      <div v-else-if="notFound" class="page-shell py-12">
        <div class="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <ShieldCheck class="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <p class="mt-4 text-sm font-medium text-foreground">{{ t('news.detail.notFound') }}</p>
          <p class="mt-1 text-sm text-muted-foreground">{{ t('news.detail.notFoundHint') }}</p>
          <Button variant="outline" size="sm" class="mt-5 rounded-lg" as-child>
            <NuxtLink to="/news/verified">
              <ArrowLeft class="mr-1.5 h-4 w-4" />
              {{ t('news.detail.back') }}
            </NuxtLink>
          </Button>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="loadError" class="page-shell py-8">
        <div class="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/40" role="alert">
          <div class="flex items-start gap-2.5">
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p class="text-sm font-medium text-red-900 dark:text-red-200">{{ t('news.detail.error') }}</p>
          </div>
          <Button variant="outline" size="sm" class="rounded-lg" @click="reload">{{ t('news.error.retry') }}</Button>
        </div>
      </div>

      <!-- Story -->
      <template v-else-if="article">
        <section class="border-b border-border">
          <div class="page-shell py-8 sm:py-10">
            <NuxtLink to="/news/verified" class="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" />
              {{ t('news.detail.back') }}
            </NuxtLink>

            <div class="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span class="inline-flex items-center gap-1.5 font-medium text-foreground">
                <span class="h-2 w-2 rounded-full" :class="groupDot(artistName)" aria-hidden="true" />
                {{ artistName }}
              </span>
              <span class="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{{ t(`news.category.${article.category}`) }}</span>
              <span
                class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                :aria-label="t('news.scoreAria', { score: article.verification_score })"
              >
                <BadgeCheck class="h-3.5 w-3.5" aria-hidden="true" />
                {{ t('news.detail.badge', { score: article.verification_score }) }}
              </span>
            </div>

            <h1 class="mt-3 text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
              {{ article.title }}
            </h1>

            <p
              v-if="article.translated && article.original_title && article.original_title !== article.title"
              class="mt-2 max-w-3xl text-sm italic leading-relaxed text-muted-foreground"
            >
              <span class="not-italic rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">{{ t('news.translated') }}</span>
              {{ t('news.detail.originalTitle', { title: article.original_title }) }}
            </p>
            <p
              v-if="article.translated"
              class="mt-1 text-[11px] leading-relaxed text-muted-foreground"
            >
              {{ t('news.detail.translationNote') }}
            </p>

            <p v-if="article.summary" class="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {{ article.summary }}
            </p>

            <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              <span v-if="article.publisher_name || article.publisher_domain" class="font-medium text-foreground">
                {{ article.publisher_name || article.publisher_domain }}
              </span>
              <span v-if="article.published_at" class="inline-flex items-center gap-1.5">
                <CalendarDays class="h-3.5 w-3.5" aria-hidden="true" />
                {{ t('news.published') }} {{ formatDate(article.published_at, { withTime: true }) }}
              </span>
              <span v-if="article.event_date" class="inline-flex items-center gap-1.5">
                <CalendarDays class="h-3.5 w-3.5" aria-hidden="true" />
                {{ t('news.eventDate') }} {{ formatDate(article.event_date) }}
              </span>
              <span v-if="article.language" class="uppercase">{{ article.language }}</span>
            </div>

            <div class="mt-5 flex flex-wrap items-center gap-2">
              <Button v-if="originalUrl" variant="default" size="sm" class="rounded-lg" as-child>
                <a :href="originalUrl" target="_blank" rel="noopener noreferrer nofollow">
                  <ExternalLink class="mr-1.5 h-4 w-4" />
                  {{ t('news.detail.readOriginal') }}
                </a>
              </Button>
              <Button variant="outline" size="sm" class="rounded-lg" as-child>
                <NuxtLink to="/news/verified">{{ t('news.detail.back') }}</NuxtLink>
              </Button>
            </div>
          </div>
        </section>

        <div class="page-shell grid gap-6 py-8 lg:grid-cols-3">
          <!-- Score -->
          <section class="lg:col-span-1">
            <div class="rounded-xl border border-border bg-card p-4">
              <div class="flex items-baseline justify-between gap-3">
                <h2 class="text-sm font-semibold text-foreground">{{ t('news.detail.scoreTitle') }}</h2>
                <span class="text-2xl font-bold tabular-nums text-foreground">{{ score }}<span class="text-sm font-medium text-muted-foreground">/100</span></span>
              </div>

              <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" role="img" :aria-label="t('news.scoreAria', { score })">
                <div class="h-full rounded-full bg-emerald-500" :style="{ width: `${Math.max(0, Math.min(100, score))}%` }" />
              </div>

              <p class="mt-3 text-xs text-muted-foreground">{{ t('news.detail.breakdownTitle') }}</p>
              <ul class="mt-2 space-y-2.5">
                <li v-for="row in breakdown" :key="row.key">
                  <div class="flex items-center justify-between gap-3 text-xs">
                    <span class="text-foreground">{{ t(`news.component.${row.key}`) }}</span>
                    <span class="tabular-nums text-muted-foreground">{{ row.points }} / {{ row.max }}</span>
                  </div>
                  <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      class="h-full rounded-full bg-foreground/70"
                      :style="{ width: `${Math.max(0, Math.min(100, (row.points / row.max) * 100))}%` }"
                    />
                  </div>
                </li>
              </ul>

              <p class="mt-4 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <template v-if="failedGates.length === 0">{{ t('news.detail.gatesPassed') }}</template>
                <template v-else>
                  <span class="font-medium text-foreground">{{ t('news.detail.gatesFailed') }}:</span>
                  {{ failedGates.join(', ') }}
                </template>
              </p>

              <dl class="mt-4 space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                <div class="flex justify-between gap-3">
                  <dt>{{ t('news.detail.lastVerified') }}</dt>
                  <dd class="tabular-nums text-foreground">{{ formatDate(article.last_checked_at, { withTime: true }) || '—' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt>{{ t('news.detail.firstSeen') }}</dt>
                  <dd class="tabular-nums text-foreground">{{ formatDate(article.first_discovered_at, { withTime: true }) || '—' }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt>{{ t('news.detail.version') }}</dt>
                  <dd class="tabular-nums text-foreground">#{{ article.verification_version }}</dd>
                </div>
              </dl>
              <p class="mt-3 text-[11px] text-muted-foreground">{{ t('news.detail.timezoneNote') }}</p>
            </div>
          </section>

          <!-- Claims + sources + evidence -->
          <div class="space-y-6 lg:col-span-2">
            <section class="rounded-xl border border-border bg-card p-4">
              <h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Quote class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {{ t('news.detail.claimsTitle') }}
              </h2>
              <p v-if="!article.claims || article.claims.length === 0" class="mt-2 text-xs text-muted-foreground">
                {{ t('news.detail.claimsEmpty') }}
              </p>
              <ul v-else class="mt-3 space-y-3">
                <li v-for="claim in article.claims" :key="claim.id" class="rounded-lg border border-border px-3 py-2.5">
                  <p class="text-sm leading-relaxed text-foreground">{{ claim.claim_text }}</p>
                  <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{{ claim.predicate }}</span>
                    <span>·</span>
                    <span>{{ t(`news.detail.claimType.${claim.claim_type}`) }}</span>
                    <span>·</span>
                    <span>{{ t(`news.detail.claimStatus.${claim.claim_status}`) }}</span>
                    <span v-if="claim.relevant_dates">· {{ claim.relevant_dates }}</span>
                  </div>
                  <p v-if="claim.verification_notes && claim.verification_notes.length" class="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    {{ t('news.detail.notes') }}: {{ claim.verification_notes.join(' · ') }}
                  </p>
                </li>
              </ul>
            </section>

            <section class="rounded-xl border border-border bg-card p-4">
              <h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {{ t('news.detail.sourcesTitle') }}
              </h2>
              <p v-if="!article.corroborations || article.corroborations.length === 0" class="mt-2 text-xs text-muted-foreground">
                {{ t('news.detail.sourcesEmpty') }}
              </p>
              <ul v-else class="mt-3 space-y-2">
                <li
                  v-for="(entry, index) in article.corroborations"
                  :key="`${entry.url}-${index}`"
                  class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <span class="min-w-0 truncate text-xs text-foreground">{{ entry.domain || entry.url }}</span>
                  <span class="flex items-center gap-2">
                    <span
                      v-if="entry.independent"
                      class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >{{ t('news.detail.independent') }}</span>
                    <a
                      :href="entry.url"
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      class="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                    >
                      {{ t('news.detail.evidenceOpen') }}
                      <ExternalLink class="h-3 w-3" aria-hidden="true" />
                    </a>
                  </span>
                </li>
              </ul>
            </section>

            <section class="rounded-xl border border-border bg-card p-4">
              <h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Images class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {{ t('news.detail.evidenceTitle') }}
                <span class="ml-auto text-xs font-normal tabular-nums text-muted-foreground">{{ article.evidence?.length || 0 }}</span>
              </h2>
              <p class="mt-2 text-[11px] text-muted-foreground">{{ t('news.detail.evidenceRights') }}</p>

              <p v-if="!article.evidence || article.evidence.length === 0" class="mt-2 text-xs text-muted-foreground">
                {{ t('news.detail.evidenceEmpty') }}
              </p>
              <div v-else class="mt-3 grid gap-3 sm:grid-cols-2">
                <article
                  v-for="item in article.evidence"
                  :key="item.id"
                  class="overflow-hidden rounded-lg border border-border"
                >
                  <div v-if="item.image_url || item.thumbnail_url" class="h-32 w-full overflow-hidden bg-muted">
                    <img
                      :src="item.thumbnail_url || item.image_url"
                      :alt="item.evidence_description || evidenceLabel(item.evidence_type)"
                      loading="lazy"
                      decoding="async"
                      referrerpolicy="no-referrer"
                      class="h-full w-full object-cover"
                      @error="hideBrokenImage"
                    />
                  </div>
                  <div class="space-y-1 p-3">
                    <p class="text-xs font-medium text-foreground">{{ evidenceLabel(item.evidence_type) }}</p>
                    <p v-if="item.evidence_description" class="text-[11px] leading-relaxed text-muted-foreground">
                      {{ item.evidence_description }}
                    </p>
                    <p v-if="item.source_name || item.source_domain" class="text-[11px] text-muted-foreground">
                      {{ item.source_name || item.source_domain }}
                    </p>
                    <a
                      v-if="item.source_url"
                      :href="item.source_url"
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      class="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                    >
                      {{ t('news.detail.evidenceOpen') }}
                      <ExternalLink class="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>
      </template>
    </main>

    <SiteFooter />
    <BackToTop />
    <MobileTabBar />
  </div>
</template>
