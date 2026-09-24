<script setup lang="ts">
import { Trash2, BookOpen } from 'lucide-vue-next'
import { GROUPS, groupDot, formatUSD } from '@/lib/catalog'

useHead({ title: 'My Collection — HIBIKISHOP PC' })

const route = useRoute()
const router = useRouter()

const {
  items, stats, loading, error, fetchCollection, removeFromCollection,
} = useCollection()

const activeTab = ref<'all' | 'owned' | 'wishlist'>(
  route.query.tab === 'wishlist' || route.query.tab === 'owned' ? route.query.tab : 'all',
)
const showRemoveDialog = ref(false)
const removeTarget = ref<number | null>(null)
const exchangeRates = ref<any>(null)
const groupTotals = ref<Record<string, number>>({})

onMounted(() => {
  fetchCollection(true)
  loadExchangeRates()
  loadGroupTotals()
})

watch(
  () => route.query.tab,
  (value) => {
    const next = value === 'wishlist' || value === 'owned' ? value : 'all'
    if (next !== activeTab.value) activeTab.value = next
  },
)

async function loadGroupTotals() {
  try {
    const results = await Promise.all(
      GROUPS.map(async (group) => {
        const res = await $fetch<any>(`/api/cards?group=${encodeURIComponent(group)}&page=1&limit=1`)
        return [group, res?.pagination?.total ?? 0] as const
      }),
    )
    const next: Record<string, number> = {}
    for (const [group, total] of results) next[group] = total
    groupTotals.value = next
  } catch (e) {
    console.error('Failed to load group totals:', e)
  }
}

watch(activeTab, (value) => {
  router.replace({ query: { ...route.query, tab: value === 'all' ? undefined : value } })
})

async function loadExchangeRates() {
  try {
    const response = await $fetch<any>('/api/exchangerate')
    if (response.success) exchangeRates.value = response.data
  } catch (e) {
    console.error('Failed to load exchange rates:', e)
  }
}

const rate = computed(() => exchangeRates.value?.usd?.rate || 17800)

const filteredItems = computed(() => {
  if (activeTab.value === 'all') return items.value
  return items.value.filter(item => item.status === activeTab.value)
})

const groupedItems = computed(() => {
  return GROUPS.map((group) => {
    const groupItems = filteredItems.value.filter(item => item.group_name === group)
    const ownedCount = items.value.filter(i => i.group_name === group && i.status === 'owned').length
    const total = groupTotals.value[group] ?? 0
    return {
      group,
      items: groupItems,
      ownedCount,
      total,
      hasProgress: total > 0,
    }
  }).filter(section => section.items.length > 0)
})

const orphans = computed(() => {
  const known = new Set(GROUPS as unknown as string[])
  return filteredItems.value.filter(item => !known.has(item.group_name))
})

async function confirmRemove() {
  if (removeTarget.value == null) return
  const id = removeTarget.value
  removeTarget.value = null
  showRemoveDialog.value = false
  await removeFromCollection(id)
}

function mapForCard(item: any) {
  return {
    id: item.card_id,
    name: item.name,
    image: item.image,
    member_name: item.member_name,
    group_name: item.group_name,
    card_type: item.card_type,
    price: item.last_price,
    discounted_price: item.last_discounted_price,
  }
}

function removeById(collectionId: number) {
  removeTarget.value = collectionId
  showRemoveDialog.value = true
}

function cancelRemove() {
  removeTarget.value = null
  showRemoveDialog.value = false
}

const tabDefs = computed(() => [
  { key: 'all' as const, label: 'All', count: items.value.length },
  { key: 'owned' as const, label: 'Owned', count: stats.value.totalOwned },
  { key: 'wishlist' as const, label: 'Wishlist', count: stats.value.totalWishlist },
])
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader active="collection" />

    <main class="page-shell py-6 sm:py-8">
      <div class="mb-5 sm:mb-6">
        <p class="eyebrow">Binder</p>
        <h1 class="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">My Collection</h1>
        <p class="mt-1 text-sm text-muted-foreground">Keep track of cards you own and want.</p>
      </div>

      <!-- Compact summary -->
      <div class="mb-5 grid grid-cols-3 gap-2 rounded-xl border border-zinc-200 bg-card px-3 py-3 text-sm dark:border-zinc-800 sm:mb-8 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2 sm:px-4 sm:py-3.5">
        <div class="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span class="text-lg font-semibold tabular-nums text-foreground">{{ items.length }}</span>
          <span class="truncate text-xs text-muted-foreground sm:text-sm">cards</span>
        </div>
        <div class="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span class="truncate font-medium tabular-nums text-foreground">
            {{ formatUSD(stats.totalOwnedValue) }}
          </span>
          <span class="truncate text-xs text-muted-foreground sm:text-sm">owned value</span>
        </div>
        <div class="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span class="font-medium tabular-nums text-foreground">{{ stats.totalWishlist }}</span>
          <span class="truncate text-xs text-muted-foreground sm:text-sm">wishlist</span>
        </div>
      </div>

      <!-- Tabs -->
      <Tabs v-model="activeTab" class="mb-6">
        <TabsList class="grid h-11 w-full grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:flex sm:h-10 sm:w-auto sm:justify-start">
          <TabsTrigger
            v-for="tab in tabDefs"
            :key="tab.key"
            :value="tab.key"
            class="min-w-0 rounded-md px-2 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm sm:px-3"
          >
            <span class="truncate">{{ tab.label }}</span>
            <span class="ml-1 tabular-nums text-muted-foreground">({{ tab.count }})</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <!-- Error -->
      <div
        v-if="error && !loading"
        class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        role="alert"
      >
        Unable to load your collection. Please try again.
        <button type="button" class="ml-2 font-medium underline underline-offset-2" @click="fetchCollection(true)">Retry</button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <div v-for="i in 8" :key="i" class="pc-skeleton">
          <div class="skeleton-block aspect-square rounded-none" />
          <div class="space-y-2.5 p-3">
            <div class="skeleton-block h-3 w-1/3" />
            <div class="skeleton-block h-3.5 w-full" />
            <div class="skeleton-block h-4 w-1/2" />
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div
        v-else-if="filteredItems.length === 0 && !error"
        class="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700"
      >
        <BookOpen class="mx-auto h-8 w-8 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
        <p class="mt-3 text-sm font-medium text-foreground">
          <template v-if="activeTab === 'wishlist'">Your wishlist is empty.</template>
          <template v-else-if="activeTab === 'owned'">You haven't marked any cards as owned.</template>
          <template v-else>Your collection is empty.</template>
        </p>
        <p class="mt-1 text-sm text-muted-foreground">Start adding photocards you want to keep track of.</p>
        <Button variant="outline" class="mt-4 rounded-lg" as-child>
          <NuxtLink to="/browse">Browse Photocards</NuxtLink>
        </Button>
      </div>

      <!-- Grouped binder sections -->
      <div v-else class="space-y-10">
        <section
          v-for="section in groupedItems"
          :key="section.group"
        >
          <div class="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div class="flex min-w-0 items-center gap-2">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="groupDot(section.group)" />
              <h2 class="truncate text-base font-semibold text-foreground sm:text-lg">{{ section.group }}</h2>
            </div>
            <div class="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs text-muted-foreground sm:gap-3">
              <span v-if="section.hasProgress" class="shrink-0 tabular-nums">
                {{ section.ownedCount }} / {{ section.total.toLocaleString() }} collected
              </span>
              <span v-else class="shrink-0 tabular-nums">{{ section.ownedCount }} owned</span>
              <div
                v-if="section.hasProgress"
                class="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-100 sm:w-24 dark:bg-zinc-800"
                role="progressbar"
                :aria-valuenow="section.ownedCount"
                :aria-valuemin="0"
                :aria-valuemax="section.total"
                :aria-label="`${section.group} collection progress`"
              >
                <div
                  class="h-full rounded-full bg-foreground transition-all duration-300"
                  :style="{
                    width: `${Math.min(100, Math.round((section.ownedCount / section.total) * 100))}%`,
                  }"
                />
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            <div v-for="item in section.items" :key="item.id" class="group relative">
              <PhotocardCard
                :card="mapForCard(item)"
                :rate="rate"
                :badge="item.status === 'owned' ? 'Owned' : 'Wishlist'"
              />
              <button
                type="button"
                class="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white/90 text-zinc-500 shadow-sm backdrop-blur-sm transition duration-150 hover:border-red-200 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-400 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                :aria-label="`Remove ${item.name} from collection`"
                @click.stop="removeById(item.id)"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        <!-- Non-standard group names -->
        <section v-if="orphans.length > 0">
          <div class="mb-4 flex items-center gap-2">
            <h2 class="text-base font-semibold text-foreground sm:text-lg">Other</h2>
            <span class="text-xs text-muted-foreground tabular-nums">{{ orphans.length }}</span>
          </div>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            <div v-for="item in orphans" :key="item.id" class="group relative">
              <PhotocardCard
                :card="mapForCard(item)"
                :rate="rate"
                :badge="item.status === 'owned' ? 'Owned' : 'Wishlist'"
              />
              <button
                type="button"
                class="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white/90 text-zinc-500 shadow-sm backdrop-blur-sm transition duration-150 hover:border-red-200 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-400 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                :aria-label="`Remove ${item.name} from collection`"
                @click.stop="removeById(item.id)"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>

    <!-- Remove Dialog -->
    <AlertDialog :open="showRemoveDialog" @update:open="(v: boolean) => { if (!v) cancelRemove() }">
      <AlertDialogContent class="max-w-sm rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle class="text-base">Remove from collection?</AlertDialogTitle>
          <AlertDialogDescription class="text-muted-foreground">
            This card will be removed from your collection. You can add it again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter class="gap-2 sm:justify-end">
          <AlertDialogCancel class="rounded-lg" @click="cancelRemove">Cancel</AlertDialogCancel>
          <AlertDialogAction class="rounded-lg" @click="confirmRemove">Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
