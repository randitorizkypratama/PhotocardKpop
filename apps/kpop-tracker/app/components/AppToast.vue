<script setup lang="ts">
import { AlertCircle, Check } from 'lucide-vue-next'

const { toasts, dismiss } = useToast()
</script>

<template>
  <!-- aria-live=polite: the outcome is announced without stealing focus.
       Sits above the MobileTabBar (bottom-20) and the back-to-top button. -->
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end md:px-0"
      aria-live="polite"
      aria-atomic="true"
    >
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-3 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-3 opacity-0"
      >
        <button
          v-for="toast in toasts"
          :key="toast.id"
          type="button"
          class="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-card px-4 py-3 text-left shadow-lg"
          :class="toast.variant === 'error'
            ? 'border-red-200 dark:border-red-900/60'
            : 'border-border'"
          @click="dismiss(toast.id)"
        >
          <Check
            v-if="toast.variant === 'success'"
            class="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          <AlertCircle
            v-else
            class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
          <span class="min-w-0 text-sm font-medium leading-snug text-foreground">
            {{ toast.message }}
          </span>
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
