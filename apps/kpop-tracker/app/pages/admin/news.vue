<script setup lang="ts">
import { BadgeCheck, ExternalLink, Lock, RefreshCw, Sparkles } from 'lucide-vue-next'

useHead({
  title: 'News drafts — HIBIKISHOP PC',
  meta: [{ name: 'robots', content: 'noindex,nofollow' }],
})

const { t } = useLocale()
const { user, checked: authChecked, refresh: refreshAuth } = useAuth()

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
  /** Source article's internal verification state — context only. */
  source_status: string | null
  source_score: number | null
  images: AiDraftImage[]
  sources: AiDraftSource[]
}

interface NewsReview {
  counts: Record<string, number>
  rewrite_counts: Record<string, number>
  policy: { min_score: number }
  drafts: AiDraft[]
  rewrite_policy: { enabled: boolean, model: string, max_per_run: number, keys: number }
}

const gate = ref<'checking' | 'guest' | 'forbidden' | 'admin'>('checking')

/**
 * This page renders against the visitor's own session — the server-rendered
 * self-call needs the cookie forwarded explicitly, exactly like /status.  Like
 * /status it must never be cached (see nuxt.config.ts routeRules and
 * tests/cache-safety.test.ts): a cached copy would hand the draft queue to
 * every visitor.
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
      rewrite_counts: Record<string, number>
      policy: { min_score: number }
      drafts: AiDraft[]
      rewrite_policy: NewsReview['rewrite_policy']
    }>('/api/news/admin', ssrOpts).catch(() => null)

    return res?.success
      ? {
          counts: res.counts || {},
          rewrite_counts: res.rewrite_counts || {},
          policy: res.policy,
          drafts: res.drafts || [],
          rewrite_policy: res.rewrite_policy,
        }
      : null
  },
  { immediate: isAdmin },
)

const { data: reviewRes, pending: loading, refresh: reload } = review

const drafts = computed<AiDraft[]>(() => reviewRes.value?.drafts ?? [])
const draftCount = computed(() => Number(reviewRes.value?.rewrite_counts?.draft ?? 0))
const approvedCount = computed(() => Number(reviewRes.value?.rewrite_counts?.approved ?? 0))
const publishedCount = computed(() => Number(reviewRes.value?.rewrite_counts?.published ?? 0))
const minScore = computed(() => Number(reviewRes.value?.policy?.min_score ?? 83))
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
              <span class="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-violet-700 ring-1 ring-inset ring-violet-500/30 dark:text-violet-400">
                <Sparkles class="h-3 w-3" aria-hidden="true" />
                {{ draftCount }} {{ t('newsReview.countDraft') }}
              </span>
              <span class="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                {{ approvedCount }} {{ t('newsReview.countApproved') }}
              </span>
              <span class="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400">
                {{ publishedCount }} {{ t('newsReview.countPublished') }}
              </span>
              <span class="text-[11px] text-muted-foreground">{{ t('newsReview.minScore', { min: minScore }) }}</span>
              <Button variant="outline" size="sm" class="ml-auto rounded-lg" :disabled="loading" @click="reload">
                <RefreshCw class="mr-1.5 h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
                {{ t('newsReview.refresh') }}
              </Button>
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

        <!-- AI drafts awaiting a decision -->
        <section class="page-shell py-8">
          <div v-if="loading" class="space-y-3">
            <div v-for="i in 3" :key="i" class="skeleton-block h-28 rounded-xl" />
          </div>

          <div v-else-if="loadError" class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">
            {{ t('newsReview.error') }}
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
                  <span
                    v-if="draft.status === 'approved'"
                    class="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {{ t('newsReview.statusApproved') }}
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
                <span
                  v-if="draft.source_status"
                  class="rounded-md bg-muted px-2 py-0.5 tabular-nums"
                  :title="t('newsReview.sourceHint')"
                >
                  {{ t('newsReview.sourceContext') }}: {{ draft.source_status }} · {{ draft.source_score }}/100
                </span>
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
