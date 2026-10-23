<script setup lang="ts">
import { ArrowRight, Camera, Music2, Search } from 'lucide-vue-next'
import { GROUPS, groupAccentActive, groupDot } from '@/lib/catalog'
import { FEATURED_CARD_TYPES, cardTypeBlurb } from '@/lib/cardTypes'
import { ART_CARD_WIDTHS, artworkSrcset, gridSrcset, onImageError } from '@/lib/imageVariants'

useHead({ title: 'HIBIKISHOP PC — K-Pop Photocard Database' })
useSeoMeta({
  ogTitle: 'HIBIKISHOP PC — K-Pop Photocard Database',
  ogDescription: 'Explore album PCs, POBs, lucky draws and special photocards — by group, member, album, with market reference from Pocamarket.',
  ogUrl: 'https://kpop-tracker-six.vercel.app/',
})
const { t, fmt } = useLocale()

const cardTypeTabs = FEATURED_CARD_TYPES as unknown as string[]

const selectedGroup = ref<string>('IVE')
const searchQuery = ref('')
const { fetchCollection, wishlistIds, toggleWishlist } = useCollection()

const groupTabs = GROUPS

const exploreGroups = [
  {
    name: 'IVE',
    descKey: 'groups.desc.ive',
    accent: 'border-ive/25 bg-ive/5 hover:border-ive/40',
    dot: 'bg-ive',
    text: 'text-ive',
  },
  {
    name: 'aespa',
    descKey: 'groups.desc.aespa',
    accent: 'border-aespa/25 bg-aespa/5 hover:border-aespa/40',
    dot: 'bg-aespa',
    text: 'text-aespa',
  },
  {
    name: 'Hearts2Hearts',
    descKey: 'groups.desc.h2h',
    accent: 'border-h2h/25 bg-h2h/5 hover:border-h2h/40',
    dot: 'bg-h2h',
    text: 'text-h2h',
  },
]

// The collection is auth-scoped, so it stays client-side (useCollection already
// guards that fetch). Everything below now runs during SSR instead: the HTML
// ships with the hero releases and the first card grid already rendered, rather
// than a skeleton that only fills in after mount.
//
// Each handler swallows its own failure — a slow or 429'd API must degrade to
// the empty state, never abort the SSR render.
onMounted(() => fetchCollection())

// useAsyncData() kicks off its fetch synchronously, so create all three first
// and only await afterwards — awaiting inline would make SSR pay for them one
// round trip at a time.
const ratesAsync = useAsyncData(
  // Shared key: navigating from here to a group page reuses the same rate
  // instead of refetching it.
  'shared:exchangerate',
  () => $fetch<any>('/api/exchangerate').catch(() => null),
)

const releasesAsync = useAsyncData(
  'home:releases',
  () => $fetch<any>('/api/releases?limit=12').catch(() => null),
)

const cardsAsync = useAsyncData(
  () => `home:cards:${selectedGroup.value}`,
  () => $fetch<any>(
    `/api/cards?group=${encodeURIComponent(selectedGroup.value)}&page=1&limit=10&sort=popular`,
  ).catch(() => null),
  { watch: [selectedGroup] },
)

await Promise.all([ratesAsync, releasesAsync, cardsAsync])

const { data: ratesRes } = ratesAsync
const { data: releasesRes } = releasesAsync
const { data: cardsRes, pending: loading, refresh: reloadCards } = cardsAsync

const releases = computed<any[]>(() => releasesRes.value?.data || [])
const cards = computed<any[]>(() => cardsRes.value?.data || [])
const rate = computed(() => ratesRes.value?.data?.usd?.rate || 17800)

/**
 * Separates "the request failed" from "there is nothing here".
 *
 * Each handler resolves to null instead of throwing, which is correct for SSR —
 * an unreachable API must not abort the render. But `cards` then reads as an
 * empty array either way, so the empty state below told the visitor there were
 * no photocards at all, offering a button to browse all of them, while the real
 * answer was that the call had failed. Neither branch could tell the two apart.
 */
const loadError = computed(() => cardsRes.value == null)

function releaseDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * These squares run ~150 CSS px at the 6-column step.
 *
 * artworkSrcset declines a `release.image` fallback (no Apple size suffix), so
 * fall through to the card grid route for it — CloudFront is allowlisted too.
 */
function artSrcset(release: { artwork?: string | null, image?: string | null }) {
  return artworkSrcset(release.artwork, ART_CARD_WIDTHS) ?? gridSrcset(release.image)
}

function submitSearch() {
  const q = searchQuery.value.trim()
  navigateTo({ path: '/browse', query: q ? { q } : {} })
}

async function onWishlist(id: number | string) {
  await toggleWishlist(Number(id))
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader active="home" />

    <main>
      <!-- Hero -->
      <section class="border-b border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-10 sm:py-14 lg:py-16">
          <div class="mx-auto max-w-2xl text-center">
            <p class="eyebrow">{{ t('home.eyebrow') }}</p>
            <h1 class="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              HIBIKISHOP PC
            </h1>
            <p class="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {{ t('home.heroDescA') }}
              <a href="https://pocamarket.com" target="_blank" rel="noopener noreferrer" class="font-medium text-foreground underline-offset-2 hover:underline">Pocamarket</a>.
            </p>

            <form class="mx-auto mt-7 max-w-md" role="search" @submit.prevent="submitSearch">
              <label for="hero-search" class="sr-only">{{ t('home.searchAria') }}</label>
              <div class="relative">
                <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="hero-search"
                  v-model="searchQuery"
                  type="search"
                  :placeholder="t('home.searchPlaceholder')"
                  class="h-12 w-full rounded-xl border border-zinc-300 bg-card pl-11 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
                />
              </div>
            </form>

            <div class="mt-3.5 flex justify-center">
              <NuxtLink
                to="/identify"
                class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:border-zinc-300 hover:text-foreground dark:border-zinc-800 dark:hover:border-zinc-700"
              >
                <Camera class="h-4 w-4" />
                {{ t('home.photoSearch') }}
              </NuxtLink>
            </div>

            <div class="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                v-for="group in groupTabs"
                :key="group"
                type="button"
                class="rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="
                  selectedGroup === group
                    ? groupAccentActive(group)
                    : 'border-zinc-200 bg-card text-muted-foreground hover:border-zinc-300 hover:text-foreground dark:border-zinc-800 dark:hover:border-zinc-700'
                "
                :aria-pressed="selectedGroup === group"
                @click="selectedGroup = group"
              >
                <span class="inline-flex items-center gap-1.5">
                  <span class="h-1.5 w-1.5 rounded-full" :class="groupDot(group)" />
                  {{ group }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Explore by card type -->
      <section id="card-types" class="scroll-mt-20 border-b border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-10 sm:py-12">
          <div class="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
            <div>
              <p class="eyebrow">{{ t('cardTypes.eyebrow') }}</p>
              <h2 class="mt-1.5 section-title">{{ t('cardTypes.title') }}</h2>
            </div>
            <NuxtLink
              to="/browse"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {{ t('cardTypes.all') }}
              <ArrowRight class="h-4 w-4" />
            </NuxtLink>
          </div>

          <div class="grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800">
            <NuxtLink
              v-for="type in cardTypeTabs"
              :key="type"
              :to="{ path: '/browse', query: { card_type: type } }"
              class="group flex items-start justify-between gap-3 bg-card p-4 transition-colors duration-150 hover:bg-zinc-50 sm:p-5 dark:hover:bg-zinc-900"
            >
              <span class="min-w-0">
                <span class="block text-sm font-medium text-foreground">{{ type }}</span>
                <span class="mt-1.5 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {{ cardTypeBlurb(type, t) }}
                </span>
              </span>
              <ArrowRight class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- Explore releases -->
      <section
        v-if="releases.length > 0"
        id="releases"
        class="scroll-mt-20 border-b border-zinc-200 dark:border-zinc-800"
      >
        <div class="page-shell py-10 sm:py-12">
          <div class="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
            <div>
              <p class="eyebrow">{{ t('releases.eyebrow') }}</p>
              <h2 class="mt-1.5 section-title">{{ t('releases.title') }}</h2>
            </div>
            <NuxtLink
              to="/releases"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {{ t('releases.all') }}
              <ArrowRight class="h-4 w-4" />
            </NuxtLink>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
            <NuxtLink
              v-for="release in releases"
              :key="release.release_name"
              :to="`/releases/${encodeURIComponent(release.group_name || 'IVE')}/${release.slug}`"
              class="group min-w-0"
            >
              <span class="relative block aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                <img
                  v-if="release.artwork || release.image"
                  :src="release.artwork || release.image"
                  :srcset="artSrcset(release)"
                  sizes="(min-width: 1536px) 190px, (min-width: 1024px) 160px, (min-width: 640px) 31vw, 45vw"
                  :alt="`${release.release_name} release`"
                  loading="lazy"
                  decoding="async"
                  @error="onImageError"
                  class="h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.02]"
                />
                <Music2
                  v-else
                  class="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600"
                  aria-hidden="true"
                />
              </span>
              <span class="mt-2 block truncate text-[13px] font-medium text-foreground">
                {{ release.release_name }}
              </span>
              <span class="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {{ release.group_name || 'Photocards' }} · {{ fmt(release.count) }} {{ t('releases.cards') }}
              </span>
              <span
                v-if="release.release_date"
                class="mt-0.5 block truncate text-[11px] tabular-nums text-muted-foreground"
              >
                {{ releaseDate(release.release_date) }}<template v-if="release.release_type"> · {{ release.release_type }}</template>
              </span>
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- Trending -->
      <section class="page-shell py-10 sm:py-12">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
          <div>
            <p class="eyebrow">{{ selectedGroup }}</p>
            <h2 class="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">{{ t('trending.title') }}</h2>
          </div>
          <NuxtLink
            to="/browse"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {{ t('viewAll') }}
            <ArrowRight class="h-4 w-4" />
          </NuxtLink>
        </div>

        <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          <div v-for="i in 10" :key="i" class="pc-skeleton">
            <div class="skeleton-block aspect-square rounded-none" />
            <div class="space-y-2.5 p-3">
              <div class="skeleton-block h-3 w-1/3" />
              <div class="skeleton-block h-3.5 w-full" />
              <div class="skeleton-block h-3.5 w-2/3" />
              <div class="skeleton-block h-4 w-1/2" />
            </div>
          </div>
        </div>

        <!-- Failed request, distinct from an empty catalogue. Without this
             branch a dead or 429'd API fell through to the panel below and
             announced "No photocards found." alongside a button inviting the
             visitor to browse all of them — a failure wearing the costume of a
             genuinely empty shelf. -->
        <div v-else-if="loadError" class="rounded-xl border border-dashed border-red-300 py-12 text-center dark:border-red-800">
          <p class="text-sm font-medium text-foreground">{{ t('empty.errorTitle') }}</p>
          <p class="mt-1 text-sm text-muted-foreground">{{ t('empty.errorHint') }}</p>
          <Button variant="outline" class="mt-4 rounded-lg" @click="reloadCards">
            {{ t('empty.errorRetry') }}
          </Button>
        </div>

        <div v-else-if="cards.length === 0" class="rounded-xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
          <p class="text-sm font-medium text-foreground">{{ t('empty.noCards') }}</p>
          <p class="mt-1 text-sm text-muted-foreground">{{ t('empty.hint') }}</p>
          <Button variant="outline" class="mt-4 rounded-lg" as-child>
            <NuxtLink to="/browse">{{ t('empty.browseAll') }}</NuxtLink>
          </Button>
        </div>

        <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          <PhotocardCard
            v-for="(card, index) in cards"
            :key="card.id"
            :card="card"
            :rate="rate"
            :eager="index < 4"
            show-wishlist
            :wishlisted="wishlistIds.has(card.id)"
            @wishlist="onWishlist"
          />
        </div>
      </section>

      <!-- Price movers -->
      <PriceMovers :rate="rate" />

      <!-- Explore Groups -->
      <section id="groups" class="scroll-mt-20 border-t border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-10 sm:py-12">
          <div class="mb-5 sm:mb-6">
            <p class="eyebrow">{{ t('groups.eyebrow') }}</p>
            <h2 class="mt-1.5 section-title">{{ t('groups.title') }}</h2>
          </div>

          <div class="grid gap-3 sm:gap-4 md:grid-cols-3">
            <NuxtLink
              v-for="group in exploreGroups"
              :key="group.name"
              :to="`/groups/${encodeURIComponent(group.name)}`"
              class="group rounded-xl border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-6"
              :class="group.accent"
            >
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full" :class="group.dot" />
                <h3 class="text-base font-semibold text-foreground sm:text-lg">{{ group.name }}</h3>
              </div>
              <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ t(group.descKey) }}</p>
              <span class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium" :class="group.text">
                {{ t('groups.open') }}
                <ArrowRight class="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </span>
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- Shop CTA -->
      <section class="border-t border-zinc-200 dark:border-zinc-800">
        <div class="page-shell py-10 sm:py-12">
          <div class="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-zinc-800">
            <div class="min-w-0">
              <p class="eyebrow">{{ t('shop.eyebrow') }}</p>
              <h2 class="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {{ t('home.shopTitle') }}
              </h2>
              <p class="mt-1.5 text-sm text-muted-foreground">
                {{ t('home.shopDesc') }}
              </p>
            </div>
            <Button class="h-10 shrink-0 gap-2 rounded-lg" as-child>
              <NuxtLink to="/shop">
                {{ t('home.shopCta') }}
                <ArrowRight class="h-4 w-4" />
              </NuxtLink>
            </Button>
          </div>
        </div>
      </section>
    </main>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
