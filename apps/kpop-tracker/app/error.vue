<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'

const props = defineProps<{
  error: {
    statusCode?: number
    statusMessage?: string
  }
}>()

const { t } = useLocale()
const is404 = computed(() => (props.error?.statusCode ?? 404) === 404)

useHead({ title: '404 — HIBIKISHOP PC' })

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-background text-foreground">
    <main class="flex flex-1 items-center justify-center px-4 py-16">
      <div class="w-full max-w-md text-center">
        <p class="eyebrow">{{ is404 ? '404' : `Error ${props.error?.statusCode ?? ''}` }}</p>
        <h1 class="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          {{ is404 ? t('error.notFoundTitle') : (props.error?.statusMessage || 'Something went wrong') }}
        </h1>
        <p v-if="is404" class="mt-3 text-sm leading-relaxed text-muted-foreground">
          {{ t('error.notFoundDesc') }}
        </p>
        <Button class="mt-7 h-10 gap-2 rounded-lg" @click="goHome">
          <ArrowLeft class="h-4 w-4" />
          {{ t('error.backHome') }}
        </Button>
      </div>
    </main>
  </div>
</template>
