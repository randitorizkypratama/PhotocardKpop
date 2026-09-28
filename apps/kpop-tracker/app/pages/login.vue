<script setup lang="ts">
import { LogIn, UserPlus } from 'lucide-vue-next'

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
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader />

    <main class="page-shell flex justify-center py-10 sm:py-16">
      <div class="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm sm:p-7">
        <p class="eyebrow">{{ mode === 'login' ? t('auth.login') : t('auth.register') }}</p>
        <h1 class="mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {{ mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle') }}
        </h1>
        <p class="mt-1.5 text-sm text-muted-foreground">
          {{ mode === 'login' ? t('auth.loginDesc') : t('auth.registerDesc') }}
        </p>

        <form class="mt-6 space-y-4" novalidate @submit.prevent="submit">
          <div>
            <label for="auth-username" class="mb-1.5 block text-sm font-medium text-foreground">
              {{ t('auth.username') }}
            </label>
            <input
              id="auth-username"
              v-model="username"
              type="text"
              autocomplete="username"
              maxlength="20"
              required
              class="h-10 w-full rounded-lg border border-zinc-200 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
            />
          </div>

          <div>
            <label for="auth-password" class="mb-1.5 block text-sm font-medium text-foreground">
              {{ t('auth.password') }}
            </label>
            <input
              id="auth-password"
              v-model="password"
              type="password"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              minlength="8"
              maxlength="128"
              required
              class="h-10 w-full rounded-lg border border-zinc-200 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
            />
          </div>

          <div v-if="mode === 'register'">
            <label for="auth-confirm" class="mb-1.5 block text-sm font-medium text-foreground">
              {{ t('auth.confirmPassword') }}
            </label>
            <input
              id="auth-confirm"
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              minlength="8"
              maxlength="128"
              required
              class="h-10 w-full rounded-lg border border-zinc-200 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
            />
          </div>

          <p
            v-if="formError"
            class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {{ formError }}
          </p>

          <Button type="submit" class="w-full rounded-lg" :disabled="pending">
            <LogIn v-if="mode === 'login'" class="mr-2 h-4 w-4" />
            <UserPlus v-else class="mr-2 h-4 w-4" />
            <template v-if="pending">
              {{ mode === 'login' ? t('auth.loggingIn') : t('auth.creating') }}
            </template>
            <template v-else>
              {{ mode === 'login' ? t('auth.login') : t('auth.register') }}
            </template>
          </Button>
        </form>

        <p class="mt-5 text-center text-sm text-muted-foreground">
          {{ mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount') }}
          <button
            type="button"
            class="ml-1 font-medium text-foreground underline underline-offset-2"
            @click="mode = mode === 'login' ? 'register' : 'login'; formError = ''"
          >
            {{ mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin') }}
          </button>
        </p>
      </div>
    </main>

    <SiteFooter />
    <MobileTabBar />
  </div>
</template>
