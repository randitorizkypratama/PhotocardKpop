<script setup lang="ts">
import { ArrowLeft, Heart, Search } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    back?: boolean
    active?: 'home' | 'browse' | 'collection'
  }>(),
  {
    back: false,
    active: undefined,
  },
)

const router = useRouter()
const headerSearch = ref('')

const navLinks = [
  { to: '/browse', label: 'Browse', key: 'browse' },
  { to: '/#groups', label: 'Groups', key: 'groups' },
  { to: '/collection', label: 'Collection', key: 'collection' },
]

function submitSearch() {
  const q = headerSearch.value.trim()
  router.push({ path: '/browse', query: q ? { q } : {} })
}
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-zinc-200/80 bg-background/90 backdrop-blur-md dark:border-zinc-800/80">
    <div class="page-shell flex h-14 items-center gap-3 sm:h-16">
      <div v-if="back" class="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="sm" class="gap-1.5 rounded-lg" @click="router.back()">
          <ArrowLeft class="h-4 w-4" />
          <span class="hidden sm:inline">Back</span>
        </Button>
        <NuxtLink to="/" class="flex items-center gap-2 sm:hidden">
          <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-8 w-8 rounded-full object-contain" />
        </NuxtLink>
      </div>

      <NuxtLink v-else to="/" class="flex shrink-0 items-center gap-2.5">
        <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-8 w-8 rounded-full object-contain sm:h-9 sm:w-9" />
        <div class="leading-tight">
          <span class="block text-sm font-semibold tracking-tight text-foreground sm:text-base">HIBIKISHOP</span>
          <span class="hidden text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:block">Photocards</span>
        </div>
      </NuxtLink>

      <nav class="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.key"
          :to="link.to"
          class="rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150"
          :class="
            active === link.key
              ? 'bg-zinc-100 text-foreground dark:bg-zinc-800'
              : 'text-muted-foreground hover:bg-zinc-50 hover:text-foreground dark:hover:bg-zinc-900'
          "
        >
          {{ link.label }}
        </NuxtLink>
      </nav>

      <div v-if="back" class="hidden items-center gap-2 md:flex">
        <NuxtLink to="/" class="flex items-center gap-2">
          <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-9 w-9 rounded-full object-contain" />
          <span class="text-base font-semibold text-foreground">HIBIKISHOP</span>
        </NuxtLink>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <form class="hidden lg:block" role="search" @submit.prevent="submitSearch">
          <label for="header-search" class="sr-only">Search photocards</label>
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="header-search"
              v-model="headerSearch"
              type="search"
              placeholder="Search member, album, photocard..."
              class="h-9 w-64 rounded-lg border border-zinc-200 bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 xl:w-72 dark:border-zinc-800 dark:bg-zinc-900/60 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
            />
          </div>
        </form>

        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-lg lg:hidden"
          aria-label="Search photocards"
          as-child
        >
          <NuxtLink to="/browse">
            <Search class="h-4 w-4" />
          </NuxtLink>
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-lg"
          aria-label="Wishlist"
          as-child
        >
          <NuxtLink to="/collection?tab=wishlist">
            <Heart class="h-4 w-4" />
          </NuxtLink>
        </Button>

        <DarkModeToggle />
      </div>
    </div>
  </header>
</template>
