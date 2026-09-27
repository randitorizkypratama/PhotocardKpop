<script setup lang="ts">
import { Activity, CalendarDays, Heart, Home, LayoutGrid, Search, ShoppingBag } from 'lucide-vue-next'

const open = useState('command-palette-open', () => false)
const query = ref('')
const results = ref<any[]>([])
const loading = ref(false)
const router = useRouter()
const { t } = useLocale()

const navItems = [
  { to: '/', label: 'palette.nav.home', icon: Home },
  { to: '/browse', label: 'palette.nav.browse', icon: LayoutGrid },
  { to: '/releases', label: 'palette.nav.releases', icon: CalendarDays },
  { to: '/collection', label: 'palette.nav.collection', icon: Heart },
  { to: '/collection?tab=wishlist', label: 'palette.nav.wishlist', icon: Heart },
  { to: '/shop', label: 'palette.nav.shop', icon: ShoppingBag },
  { to: '/status', label: 'palette.nav.status', icon: Activity },
]

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    open.value = !open.value
  }
}

watch(open, (value) => {
  if (!value) {
    query.value = ''
    results.value = []
    loading.value = false
  }
})

let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  const trimmed = value.trim()
  if (!trimmed) {
    results.value = []
    loading.value = false
    return
  }
  loading.value = true
  searchTimer = setTimeout(async () => {
    try {
      const response = await $fetch<any>('/api/cards', {
        query: { search: trimmed, limit: 6, sort: 'popular' },
      })
      results.value = response?.success ? (response.data || []) : []
    } catch {
      results.value = []
    } finally {
      loading.value = false
    }
  }, 250)
})

function go(path: string) {
  open.value = false
  router.push(path)
}
</script>

<template>
  <CommandDialog v-model:open="open">
    <CommandInput v-model="query" :placeholder="t('palette.placeholder')" />

    <CommandList>
      <div v-if="query && loading" class="py-6 text-center text-sm text-muted-foreground">
        {{ t('palette.searching') }}
      </div>

      <div v-else-if="query && results.length === 0" class="py-6 text-center text-sm text-muted-foreground">
        {{ t('palette.noResults') }} “{{ query }}”
      </div>

      <template v-else>
        <CommandGroup v-if="results.length" :heading="t('palette.cards')">
          <CommandItem
            v-for="card in results"
            :key="card.id"
            :value="`card-${card.id}`"
            class="gap-3"
            @select="go(`/card/${card.id}`)"
          >
            <img
              v-if="card.image"
              :src="card.image"
              :alt="card.name"
              class="h-8 w-8 shrink-0 rounded-md border border-zinc-200 object-cover object-top dark:border-zinc-700"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{{ card.name }}</span>
              <span class="block truncate text-xs text-muted-foreground">
                {{ card.member_name }}<template v-if="card.member_name && card.group_name"> · </template>{{ card.group_name }}
                <template v-if="card.release_name"> · {{ card.release_name }}</template>
              </span>
            </span>
            <span class="shrink-0 text-xs text-muted-foreground">{{ t('palette.open') }}</span>
          </CommandItem>
        </CommandGroup>

        <CommandGroup v-if="!query || results.length" :heading="t('palette.goto')">
          <CommandItem
            v-for="item in navItems"
            :key="item.to"
            :value="`nav-${item.to}`"
            @select="go(item.to)"
          >
            <component :is="item.icon" class="h-4 w-4" aria-hidden="true" />
            <span>{{ t(item.label) }}</span>
          </CommandItem>
        </CommandGroup>
      </template>

      <div class="border-t px-3 py-2 text-[11px] text-muted-foreground">
        <kbd class="rounded border border-zinc-300 px-1 py-0.5 font-sans dark:border-zinc-600">↑</kbd>
        <kbd class="ml-0.5 rounded border border-zinc-300 px-1 py-0.5 font-sans dark:border-zinc-600">↓</kbd>
        {{ t('palette.navigate') }} ·
        <kbd class="ml-1 rounded border border-zinc-300 px-1 py-0.5 font-sans dark:border-zinc-600">↵</kbd>
        {{ t('palette.open') }} ·
        <kbd class="ml-1 rounded border border-zinc-300 px-1 py-0.5 font-sans dark:border-zinc-600">esc</kbd>
        {{ t('palette.close') }}
      </div>
    </CommandList>
  </CommandDialog>
</template>
