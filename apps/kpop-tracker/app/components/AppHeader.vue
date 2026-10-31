<script setup lang="ts">
import { Activity, ArrowLeft, Heart, LogIn, LogOut, Newspaper, Search } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    back?: boolean
    active?: 'home' | 'browse' | 'collection' | 'shop' | 'releases' | 'news'
  }>(),
  {
    back: false,
    active: undefined,
  },
)

const router = useRouter()
const headerSearch = ref('')
const paletteOpen = useState('command-palette-open', () => false)
const { locale, t, toggleLocale } = useLocale()

const { stats, fetchCollection } = useCollection()
const { user, ensureChecked, logout } = useAuth()

onMounted(async () => {
  await ensureChecked()
  if (user.value) fetchCollection()
})

const navLinks = [
  { to: '/browse', label: 'nav.browse', key: 'browse', cls: '' },
  { to: '/#groups', label: 'nav.groups', key: 'groups', cls: 'hidden lg:block' },
  { to: '/#card-types', label: 'nav.cardTypes', key: 'card-types', cls: 'hidden xl:block' },
  { to: '/releases', label: 'nav.releases', key: 'releases', cls: '' },
  { to: '/news', label: 'nav.news', key: 'news', cls: '' },
  { to: '/collection', label: 'nav.collection', key: 'collection', cls: '' },
  { to: '/shop', label: 'nav.shop', key: 'shop', cls: '' },
]

/** First 1–2 letters of username for avatar */
const userInitials = computed(() => {
  const name = user.value?.username || ''
  return name.slice(0, 2).toUpperCase()
})

function submitSearch() {
  const q = headerSearch.value.trim()
  router.push({ path: '/browse', query: q ? { q } : {} })
}
</script>

<template>
  <header
    class="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md"
    style="padding-top: env(safe-area-inset-top, 0px)"
  >
    <div class="page-shell flex h-14 items-center gap-2 sm:h-16 sm:gap-3">

      <!-- Logo / back -->
      <div v-if="back" class="flex shrink-0 items-center gap-1 sm:gap-3">
        <Button variant="ghost" size="sm" class="gap-1.5 rounded-lg" @click="router.back()">
          <ArrowLeft class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('nav.back') }}</span>
        </Button>
        <NuxtLink to="/" class="flex shrink-0 items-center gap-2">
          <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-8 w-8 rounded-full object-contain sm:h-9 sm:w-9" />
        </NuxtLink>
      </div>

      <NuxtLink v-else to="/" class="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5">
        <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-8 w-8 shrink-0 rounded-full object-contain sm:h-9 sm:w-9" />
        <div class="min-w-0 leading-tight">
          <span class="block truncate text-sm font-bold tracking-tight text-foreground sm:text-base">HIBIKISHOP</span>
          <span class="hidden text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:block">Photocards</span>
        </div>
      </NuxtLink>

      <!-- Divider (desktop) -->
      <div class="hidden h-5 w-px bg-border md:block dark:bg-border-strong" aria-hidden="true" />

      <!-- Desktop nav -->
      <nav class="hidden items-center gap-0.5 md:flex" :aria-label="t('aria.navPrimary')">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.key"
          :to="link.to"
          :class="[
            'relative whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-150 md:px-2 xl:px-3',
            link.cls,
            active === link.key
              ? 'text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          ]"
        >
          {{ t(link.label) }}
          <!-- Active underline indicator -->
          <span
            v-if="active === link.key"
            class="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-foreground"
            aria-hidden="true"
          />
        </NuxtLink>
      </nav>

      <!-- Right side actions -->
      <div class="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">

        <!-- Search bar (xl+) -->
        <form class="hidden xl:block" role="search" @submit.prevent="submitSearch">
          <label for="header-search" class="sr-only">{{ t('search.aria') }}</label>
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="header-search"
              v-model="headerSearch"
              type="search"
              :placeholder="t('search.placeholder')"
              class="h-9 w-56 rounded-lg border border-border bg-card pl-9 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring xl:w-64 dark:bg-muted/60"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center rounded border border-border-strong px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              :aria-label="t('aria.openPalette')"
              @click="paletteOpen = true"
            >
              ⌘K
            </button>
          </div>
        </form>

        <!-- Search icon (< xl) -->
        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-lg xl:hidden"
          :aria-label="t('search.aria')"
          as-child
        >
          <NuxtLink to="/browse">
            <Search class="h-4 w-4" />
          </NuxtLink>
        </Button>

        <!-- Wishlist heart -->
        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-lg"
          :aria-label="t('palette.nav.wishlist')"
          as-child
        >
          <NuxtLink to="/collection?tab=wishlist" class="relative">
            <Heart class="h-4 w-4" />
            <span
              v-if="stats.totalWishlist > 0"
              class="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold leading-none text-white shadow-sm"
            >{{ stats.totalWishlist > 99 ? '99+' : stats.totalWishlist }}</span>
          </NuxtLink>
        </Button>

        <!-- Divider -->
        <div class="mx-0.5 h-5 w-px bg-border dark:bg-border-strong" aria-hidden="true" />

        <!-- User: avatar → menu (logout lives in here deliberately: the old
             bare button signed the visitor out on a single mis-tap) -->
        <template v-if="user">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                :aria-label="`${user.username} — ${t('auth.menu')}`"
              >
                {{ userInitials }}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-52">
              <DropdownMenuLabel class="min-w-0">
                <span class="block truncate text-sm font-semibold">{{ user.username }}</span>
                <span v-if="user.role === 'admin'" class="mt-0.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Admin</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem as-child>
                <NuxtLink to="/collection">
                  <Heart class="mr-2 h-4 w-4" />
                  {{ t('nav.collection') }}
                </NuxtLink>
              </DropdownMenuItem>
              <DropdownMenuItem as-child>
                <NuxtLink to="/collection?tab=wishlist">
                  <Heart class="mr-2 h-4 w-4" />
                  {{ t('palette.nav.wishlist') }}
                </NuxtLink>
              </DropdownMenuItem>
              <DropdownMenuItem v-if="user.role === 'admin'" as-child>
                <NuxtLink to="/admin/news">
                  <Newspaper class="mr-2 h-4 w-4" />
                  {{ t('nav.newsReview') }}
                </NuxtLink>
              </DropdownMenuItem>
              <DropdownMenuItem v-if="user.role === 'admin'" as-child>
                <NuxtLink to="/status">
                  <Activity class="mr-2 h-4 w-4" />
                  {{ t('nav.status') }}
                </NuxtLink>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem class="text-red-600 focus:text-red-600 dark:text-red-400" @select="logout()">
                <LogOut class="mr-2 h-4 w-4" />
                {{ t('auth.logout') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>
        <Button
          v-else
          variant="ghost"
          size="sm"
          class="gap-1.5 rounded-lg"
          as-child
        >
          <NuxtLink to="/login">
            <LogIn class="h-4 w-4" />
            <span class="hidden lg:inline">{{ t('auth.login') }}</span>
          </NuxtLink>
        </Button>

        <!-- Language toggle -->
        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-lg px-2 text-xs font-semibold"
          :aria-label="t('aria.language')"
          @click="toggleLocale"
        >
          {{ locale === 'en' ? 'EN' : 'ID' }}
        </Button>

        <DarkModeToggle />
      </div>
    </div>
  </header>
</template>
