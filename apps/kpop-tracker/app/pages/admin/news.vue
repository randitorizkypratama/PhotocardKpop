<script setup lang="ts">
import { BadgeCheck, ExternalLink, Lock, Newspaper, RefreshCw, ShieldAlert, Sparkles } from 'lucide-vue-next'

useHead({
  title: 'News review — HIBIKISHOP PC',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

const { t } = useLocale()
const { user, checked: authChecked, refresh: refreshAuth } = useAuth()

/**
 * One news record that never became VERIFIED.  This list is admin-only: the
 * public feed at /api/news still serves VERIFIED rows exclusively.
 */
interface ReviewArticle {
  id: string
  artist_id: string
  title: string
  summary: string | null
  category: string
  original_url: string
  publisher_name: string | null
  publisher_domain: string | null
  published_at: string | null
  verification_status: string
  verification_score: number
  verification_reasons: string[]
  failed_gates: string[]
  first_discovered_at: string | null
  last_checked_at: string | null
}

interface AiDraftImage {
  image_url: string
  source_url: string
  credit_text: string | null
  credit_url: string | null
  caption: string | null
}

interface AiDraftSource {
  source_url: string
  publisher_name: string | null
  publisher_domain: string | null
  original_title: string | null
}

/** An AI-written draft waiting for a human decision. */
interface AiDraft {
  id: string
  slug: string
  title: string
  dek: string
  body_markdown: string
  artist_id: string
  category: string
  reading_minutes: number
  status: string
  provider: string | null
  model: string | null
  error: string | null
  generated_at: string
  images: AiDraftImage[]
  sources: AiDraftSource[]
}

interface NewsReview {
  counts: Record<string, number>
  unverified: ReviewArticle[]
  policy: { min_score: number }
  drafts: AiDraft[]
  rewrite_policy: { enabled: boolean, model: string, max_per_run: number, keys: number }
}

const gate = ref<'checking' | 'guest' | 'forbidden' | 'admin'>('checking')
const tab = ref<'drafts' | 'review'>('drafts')

/**
 * This page renders against the visitor's own session — the server-rendered
 * self-call needs the cookie forwarded explicitly, exactly like /status.  Like
 * /status it must never be cached (see nuxt.config.ts routeRules and
 * tests/cache-safety.test.ts): a cached copy would hand the admin review list
 * to every visitor.
 */
const reqHeaders = useRequestHeaders(['cookie'])
const ssrOpts = import.meta.server && reqHeaders.cookie
  ? { headers: { cookie: reqHeaders.cookie } }
  : undefined

if (!authChecked.value) await refreshAuth(ssrOpts)

const isAdmin = user.value?.role === 'admin'
gate.value = !user.value ? 'guest' : isAdmin ? 'admin' : 'forbidden'

if (!user.value) await navigateTo('/login?next=/admin/news')

const review = useAsyncData<NewsReview | null>(
  'admin:news-review',
  async () => {
    if (!isAdmin) return null
    const res = await $fetch<{
      success: boolean
      counts: Record<string, number>
      unverified: ReviewArticle[]
      policy: { min_score: number }
      drafts: AiDraft[]
      rewrite_policy: NewsReview['rewrite_policy']
    }>('/api/news/admin', ssrOpts).catch(() => null)

    return res?.success
      ? {
          counts: res.counts || {},
          unverified: res.unverified || [],
          policy: res.policy,
          drafts: res.drafts || [],
          rewrite_policy: res.rewrite_policy,
        }
      : null
  },
  { immediate: isAdmin },
)

const { data: reviewRes, pending: loading, refresh: reload } = review

const articles = computed<ReviewArticle[]>(() => reviewRes.value?.unverified ?? [])
const drafts = computed<AiDraft[]>(() => reviewRes.value?.drafts ?? [])
const awaiting = computed(() => Number(reviewRes.value?.counts?.PENDING_VERIFICATION ?? 0))
const minScore = computed(() => Number(reviewRes.value?.policy?.min_score ?? 90))
const loadError = computed(() => isAdmin && !loading.value && reviewRes.value === null)

// ── Draft review actions ───────────────────────────────────────────────────
const acting = ref<string | null>(null)
const actionError = ref('')
const editing = ref<string | null>(null)
const editForm = ref({ title: '', dek: '', body_markdown: '' })

function startEdit(draft: AiDraft) {
  editing.value = draft.id
  editForm.value = { title: draft.title, dek: draft.dek, body_markdown: draft.body_markdown }
}

async function sendAction(
  draft: AiDraft,
  action: 'approve' | 'reject' | 'publish' | 'edit',
  extra: Record<string, unknown> = {},
) {
  acting.value = draft.id
  actionError.value = ''
  try {
    await $fetch(`/api/news/admin/rewrite/${encodeURIComponent(draft.id)}`, {
      method: 'POST',
      body: { action, ...extra },
    })
    editing.value = null
    await reload()
  } catch (error: any) {
    actionError.value = error?.data?.statusMessage || error?.message || 'Action failed'
  } finally {
    acting.value = null
  }
}

async function saveEdit(draft: AiDraft) {
  await sendAction(draft, 'edit', { ...editForm.value })
}

/** Chip styling per verification status. */
const NEWS_STATUS_STYLES: Record<string, { labelKey: string, chip: string }> = {
  PENDING_VERIFICATION: { labelKey: 'newsReview.status.pending', chip: 'bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-400' },
  FETCH_FAILED: { labelKey: 'newsReview.status.fetchFailed', chip: 'bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-400' },
  REJECTED: { labelKey: 'newsReview.status.rejected', chip: 'bg-red-500/10 text-red-700 ring-red-500/30 dark:text-red-400' },
  CONFLICTED: { labelKey: 'newsReview.status.conflicted', chip: 'bg-orange-500/10 text-orange-700 ring-orange-500/30 dark:text-orange-400' },
  REVOKED: { labelKey: 'newsReview.status.revoked', chip: 'bg-red-500/10 text-red-700 ring-red-500/30 dark:text-red-400' },
  EXPIRED: { labelKey: 'newsReview.status.expired', chip: 'bg-muted text-muted-foreground ring-zinc-500/30' },
  DISCOVERED: { labelKey: 'newsReview.status.discovered', chip: 'bg-muted text-muted-foreground ring-zinc-500/30' },
}

function newsStatusStyle(status: string) {
  const style = NEWS_STATUS_STYLES[status]
  return style
    ? { label: t(style.labelKey), chip: style.chip }
    : { label: status, chip: 'bg-muted text-muted-foreground ring-zinc-500/30' }
}

/** Human label for a failed verification gate, from the shared string map. */
function gateLabel(gateId: string): string {
  return t(`news.gate.${gateId}`)
}

const ARTIST_NAME: Record<string, string> = {
  aespa: 'aespa',
  hearts2hearts: 'Hearts2Hearts',
  ive: 'IVE',
}

function artistName(id: string): string {
  return ARTIST_NAME[id] || id
}

/** Date-only stays a date; a timestamp renders in WIB. */
function fmtPublished(value: string | null): string {
  if (!value) return '—'
  const hasTime = value.length > 10
  const date = new Date(hasTime ? value : `${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: hasTime ? 'Asia/Jakarta' : 'UTC',
  }).format(date)
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader />

    <main>
      <template v-if="gate === 'admin'">
        <section class="border-b border-border">
          <div class="page-shell py-8 sm:py-10">
            <p class="eyebrow">{{ t('newsReview.eyebrow') }}</p>
            <h1 class="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{{ t('newsReview.title') }}</h1>
            <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{{ t('newsReview.desc') }}</p>

            <div class="mt-5 flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-400">
                <ShieldAlert class="h-3 w-3" aria-hidden="true" />
                {{ awaiting }} {{ t('newsReview.awaiting') }}
              </span>
              <span class="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                {{ articles.length }} {{ t('newsReview.records') }}
              </span>
              <span class="text-[11px] text-muted-foreground">{{ t('newsReview.minScore', { min: minScore }) }}</span>
              <Button variant="outline" size="sm" class="ml-auto rounded-lg" :disabled="loading" @click="reload">
                <RefreshCw class="mr-1.5 h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
                {{ t('newsReview.refresh') }}
              </Button>
            </div>

            <!-- Two queues: AI drafts waiting for a decision, and news records that never verified. -->
            <div class="mt-5 inline-flex overflow-hidden rounded-lg border border-border" role="tablist">
              <button
                type="button"
                class="px-3.5 py-1.5 text-sm font-medium transition-colors"
                :class="tab === 'drafts' ? 'bg-muted text-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
                role="tab"
                :aria-selected="tab === 'drafts'"
                @click="tab = 'drafts'"
              >
                {{ t('newsReview.tabDrafts') }}
                <span class="ml-1.5 tabular-nums text-[11px] text-muted-foreground">{{ drafts.length }}</span>
              </button>
              <button
                type="button"
                class="px-3.5 py-1.5 text-sm font-medium transition-colors"
                :class="tab === 'review' ? 'bg-muted text-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
                role="tab"
                :aria-selected="tab === 'review'"
                @click="tab = 'review'"
              >
                {{ t('newsReview.tabReview') }}
                <span class="ml-1.5 tabular-nums text-[11px] text-muted-foreground">{{ articles.length }}</span>
              </button>
            </div>

            <p
              v-if="actionError"
              class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {{ actionError }}
            </p>
          </div>
        </section>

        <section v-if="tab === 'review'" class="page-shell py-8">
          <div v-if="loading" class="space-y-3">
            <div v-for="i in 4" :key="i" class="skeleton-block h-24 rounded-xl" />
          </div>

          <div v-else-if="loadError" class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">
            {{ t('newsReview.error') }}
          </div>

          <div v-else-if="articles.length === 0" class="rounded-xl border border-dashed border-border py-12 text-center">
            <Newspaper class="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p class="mt-3 text-sm font-medium text-foreground">{{ t('newsReview.empty') }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ t('newsReview.emptyHint') }}</p>
          </div>

          <ul v-else class="space-y-3">
            <li v-for="row in articles" :key="row.id" class="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div class="flex min-w-0 items-center gap-2.5">
                  <span
                    class="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset"
                    :class="newsStatusStyle(row.verification_status).chip"
                  >
                    <ShieldAlert class="h-3 w-3" aria-hidden="true" />
                    {{ newsStatusStyle(row.verification_status).label }}
                  </span>
                  <span class="truncate text-sm font-medium text-foreground">{{ row.title }}</span>
                </div>
                <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{{ row.verification_score }}/100</span>
              </div>

              <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span class="font-medium text-foreground">{{ artistName(row.artist_id) }}</span>
                <span v-if="row.category">{{ t(`news.category.${row.category}`) }}</span>
                <span v-if="row.publisher_name || row.publisher_domain">{{ row.publisher_name || row.publisher_domain }}</span>
                <span v-if="row.published_at">{{ fmtPublished(row.published_at) }}</span>
              </div>

              <div v-if="row.failed_gates.length" class="mt-2 flex flex-wrap items-center gap-1.5">
                <span class="text-[11px] font-medium text-muted-foreground">{{ t('newsReview.failedGates') }}:</span>
                <span
                  v-for="gate in row.failed_gates"
                  :key="gate"
                  class="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {{ gateLabel(gate) }}
                </span>
              </div>

              <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p
                  v-if="row.verification_reasons.length"
                  class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
                  :title="row.verification_reasons.join(' · ')"
                >
                  {{ row.verification_reasons.join(' · ') }}
                </p>
                <a
                  v-if="row.original_url"
                  :href="row.original_url"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground hover:underline"
                >
                  {{ t('newsReview.openOriginal') }}
                  <ExternalLink class="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </li>
          </ul>
        </section>

        <!-- AI drafts awaiting a decision -->
        <section v-if="tab === 'drafts'" class="page-shell py-8">
          <div v-if="loading" class="space-y-3">
            <div v-for="i in 3" :key="i" class="skeleton-block h-28 rounded-xl" />
          </div>

          <div v-else-if="drafts.length === 0" class="rounded-xl border border-dashed border-border py-12 text-center">
            <Sparkles class="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p class="mt-3 text-sm font-medium text-foreground">{{ t('newsReview.draftsEmpty') }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ t('newsReview.draftsEmptyHint') }}</p>
          </div>

          <ul v-else class="space-y-4">
            <li v-for="draft in drafts" :key="draft.id" class="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div class="flex min-w-0 items-center gap-2.5">
                  <span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-500/30 dark:text-violet-400">
                    <Sparkles class="h-3 w-3" aria-hidden="true" />
                    {{ t('newsReview.draft') }}
                  </span>
                  <span class="truncate text-sm font-medium text-foreground">{{ draft.title }}</span>
                </div>
                <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {{ draft.reading_minutes }} min · {{ draft.provider }}/{{ draft.model }}
                </span>
              </div>

              <p class="mt-2 text-xs leading-relaxed text-muted-foreground">{{ draft.dek }}</p>

              <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span class="font-medium text-foreground">{{ artistName(draft.artist_id) }}</span>
                <span>{{ t(`news.category.${draft.category}`) }}</span>
                <span>{{ fmtPublished(draft.generated_at) }}</span>
                <span>{{ draft.images.length }} {{ t('newsReview.photos') }}</span>
                <span>{{ draft.sources.length }} {{ t('newsReview.sources') }}</span>
              </div>

              <details class="mt-3">
                <summary class="cursor-pointer text-xs font-medium text-foreground">{{ t('newsReview.preview') }}</summary>
                <div class="mt-3 space-y-3">
                  <div v-if="draft.images.length" class="flex flex-wrap gap-2">
                    <a
                      v-for="(image, index) in draft.images"
                      :key="`${draft.id}-img-${index}`"
                      :href="image.credit_url || image.source_url"
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      class="block"
                    >
                      <img
                        :src="image.image_url"
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerpolicy="no-referrer"
                        class="h-20 w-32 rounded-lg border border-border object-cover"
                      />
                    </a>
                  </div>

                  <ul v-if="draft.sources.length" class="space-y-1.5">
                    <li
                      v-for="(source, index) in draft.sources"
                      :key="`${draft.id}-src-${index}`"
                      class="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
                    >
                      <span class="font-medium text-foreground">{{ source.publisher_name || source.publisher_domain }}</span>
                      <a
                        :href="source.source_url"
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        class="inline-flex items-center gap-1 underline hover:text-foreground"
                      >
                        {{ source.original_title || source.source_url }}
                        <ExternalLink class="h-3 w-3" aria-hidden="true" />
                      </a>
                    </li>
                  </ul>

                  <pre class="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-[11px] leading-relaxed text-foreground dark:bg-muted/60">{{ draft.body_markdown }}</pre>
                </div>
              </details>

              <div v-if="editing === draft.id" class="mt-3 space-y-2 rounded-lg border border-border p-3">
                <input
                  v-model="editForm.title"
                  class="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  :aria-label="t('newsReview.fieldTitle')"
                />
                <textarea
                  v-model="editForm.dek"
                  rows="2"
                  class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  :aria-label="t('newsReview.fieldDek')"
                />
                <textarea
                  v-model="editForm.body_markdown"
                  rows="10"
                  class="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
                  :aria-label="t('newsReview.fieldBody')"
                />
                <div class="flex flex-wrap gap-2">
                  <Button size="sm" class="rounded-lg" :disabled="acting === draft.id" @click="saveEdit(draft)">
                    {{ t('newsReview.saveEdit') }}
                  </Button>
                  <Button variant="outline" size="sm" class="rounded-lg" @click="editing = null">
                    {{ t('newsReview.cancel') }}
                  </Button>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Button size="sm" class="rounded-lg" :disabled="acting === draft.id" @click="sendAction(draft, 'publish')">
                  <BadgeCheck class="mr-1.5 h-3.5 w-3.5" />
                  {{ t('newsReview.publish') }}
                </Button>
                <Button variant="outline" size="sm" class="rounded-lg" :disabled="acting === draft.id" @click="sendAction(draft, 'approve')">
                  {{ t('newsReview.approve') }}
                </Button>
                <Button variant="outline" size="sm" class="rounded-lg" :disabled="acting === draft.id" @click="startEdit(draft)">
                  {{ t('newsReview.edit') }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="rounded-lg text-red-600 dark:text-red-400"
                  :disabled="acting === draft.id"
                  @click="sendAction(draft, 'reject')"
                >
                  {{ t('newsReview.reject') }}
                </Button>
              </div>
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
