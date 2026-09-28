<script setup lang="ts">
import { BookOpen, Eye, EyeOff, Heart, Loader2, LogIn, RefreshCw, UserPlus } from 'lucide-vue-next'

useHead({ title: 'Log in — HIBIKISHOP PC' })
useSeoMeta({
  ogTitle: 'Log in — HIBIKISHOP PC',
  ogDescription: 'Log in to save your wishlist and collection to your own account.',
  ogUrl: 'https://kpop-tracker-six.vercel.app/login',
})

const route = useRoute()
const router = useRouter()
const { t } = useLocale()
const { user, checked: authChecked, login, register, refresh } = useAuth()

const mode = ref<'login' | 'register'>(
  route.query.mode === 'register' ? 'register' : 'login',
)
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const formError = ref('')
const pending = ref(false)
const showPassword = ref(false)

watch(mode, (value) => {
  formError.value = ''
  const nextQuery = { ...route.query }
  if (value === 'register') nextQuery.mode = 'register'
  else delete nextQuery.mode
  router.replace({ query: nextQuery })
})

onMounted(async () => {
  if (!authChecked.value) await refresh()
  if (user.value) redirectAway()
})

function redirectAway() {
  const next = route.query.next
  router.replace(typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/')
}

async function submit() {
  formError.value = ''
  const name = username.value.trim()

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
    formError.value = t('auth.err.usernameFormat')
    return
  }
  if (password.value.length < 8) {
    formError.value = t('auth.err.passwordLength')
    return
  }
  if (mode.value === 'register' && password.value !== confirmPassword.value) {
    formError.value = t('auth.err.passwordMatch')
    return
  }

  pending.value = true
  try {
    const res = mode.value === 'login'
      ? await login(name, password.value)
      : await register(name, password.value)
    if (res.ok) redirectAway()
    else formError.value = res.message
  } finally {
    pending.value = false
  }
}

const benefits = [
  { icon: Heart, key: 'auth.benefitWishlist' },
  { icon: BookOpen, key: 'auth.benefitBinder' },
  { icon: RefreshCw, key: 'auth.benefitSync' },
]
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader />

    <main class="page-shell flex items-center justify-center py-8 sm:py-12">
      <div class="grid w-full max-w-4xl items-stretch gap-6 lg:grid-cols-2 lg:gap-12">
        <!-- Brand panel (desktop) -->
        <div class="hidden flex-col justify-between rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 p-8 text-zinc-100 shadow-lg lg:flex">
          <div class="flex items-center gap-2.5">
            <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-10 w-10 rounded-full bg-white/95 object-contain p-0.5" />
            <div class="leading-tight">
              <p class="text-base font-semibold tracking-tight text-white">HIBIKISHOP</p>
              <p class="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Photocards</p>
            </div>
          </div>

          <div class="my-8">
            <p class="text-2xl font-semibold leading-snug tracking-tight text-white xl:text-3xl">
              {{ t('auth.brandTitle') }}
            </p>
            <p class="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
              {{ t('auth.brandDesc') }}
            </p>
          </div>

          <ul class="space-y-3">
            <li v-for="benefit in benefits" :key="benefit.key" class="flex items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/10">
                <component :is="benefit.icon" class="h-4 w-4 text-zinc-300" aria-hidden="true" />
              </span>
              <span class="text-sm text-zinc-300">{{ t(benefit.key) }}</span>
            </li>
          </ul>
        </div>

        <!-- Form card -->
        <div class="flex min-h-[37rem] w-full max-w-md flex-col justify-center rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:max-w-none">
          <!-- Compact brand (mobile) -->
          <div class="mb-5 flex flex-col items-center text-center lg:hidden">
            <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-12 w-12 rounded-full object-contain" />
            <p class="mt-3 text-sm font-medium text-muted-foreground">{{ t('auth.brandTitle') }}</p>
          </div>

          <Tabs v-model="mode">
            <TabsList class="grid h-11 w-full grid-cols-2 rounded-lg bg-muted p-1">
              <TabsTrigger value="login" class="rounded-md text-sm">
                {{ t('auth.login') }}
              </TabsTrigger>
              <TabsTrigger value="register" class="rounded-md text-sm">
                {{ t('auth.register') }}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div class="mt-6">
            <h1 class="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {{ mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle') }}
            </h1>
            <p class="mt-1.5 text-sm text-muted-foreground">
              {{ mode === 'login' ? t('auth.loginDesc') : t('auth.registerDesc') }}
            </p>
          </div>

          <form class="mt-6 space-y-4" novalidate @submit.prevent="submit">
            <div class="space-y-1.5">
              <Label for="auth-username" class="text-sm">{{ t('auth.username') }}</Label>
              <Input
                id="auth-username"
                v-model="username"
                type="text"
                autocomplete="username"
                maxlength="20"
                placeholder="yujin_2025"
                required
                class="h-10"
              />
            </div>

            <div class="space-y-1.5">
              <Label for="auth-password" class="text-sm">{{ t('auth.password') }}</Label>
              <div class="relative">
                <Input
                  id="auth-password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                  minlength="8"
                  maxlength="128"
                  required
                  class="h-10 pr-10"
                />
                <button
                  type="button"
                  class="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :aria-label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
                  :title="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
                  @click="showPassword = !showPassword"
                >
                  <EyeOff v-if="showPassword" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>
              <p class="text-xs text-muted-foreground">{{ t('auth.passwordHint') }}</p>
            </div>

            <div v-if="mode === 'register'" class="space-y-1.5">
              <Label for="auth-confirm" class="text-sm">{{ t('auth.confirmPassword') }}</Label>
              <Input
                id="auth-confirm"
                v-model="confirmPassword"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                minlength="8"
                maxlength="128"
                required
                class="h-10"
              />
            </div>
            <div
              v-else
              class="flex min-h-[66px] items-center rounded-lg border border-dashed border-border bg-muted/40 px-3.5 py-3"
            >
              <p class="text-xs leading-relaxed text-muted-foreground">{{ t('auth.loginNote') }}</p>
            </div>

            <p
              v-if="formError"
              class="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {{ formError }}
            </p>

            <Button type="submit" class="h-10 w-full rounded-lg" :disabled="pending">
              <Loader2 v-if="pending" class="mr-2 h-4 w-4 animate-spin" />
              <template v-else>
                <LogIn v-if="mode === 'login'" class="mr-2 h-4 w-4" />
                <UserPlus v-else class="mr-2 h-4 w-4" />
              </template>
              <template v-if="pending">
                {{ mode === 'login' ? t('auth.loggingIn') : t('auth.creating') }}
              </template>
              <template v-else>
                {{ mode === 'login' ? t('auth.login') : t('auth.register') }}
              </template>
            </Button>
          </form>
        </div>
      </div>
    </main>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
