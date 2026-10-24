<script setup lang="ts">
import { ArrowUp } from 'lucide-vue-next'

/**
 * Floating return-to-top affordance for the long grid pages. Hidden until
 * the visitor has actually scrolled past a screen, so it never competes
 * with content at the top of the page. Sits above the MobileTabBar on
 * small screens (h-14 + safe area) via the md breakpoint switch.
 */
const visible = ref(false)

function onScroll() {
  visible.value = window.scrollY > 480
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
})

function toTop() {
  // behaviour falls back to instant under prefers-reduced-motion — see the
  // global rule in main.css.
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="translate-y-2 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-2 opacity-0"
  >
    <button
      v-if="visible"
      type="button"
      class="fixed bottom-20 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-md backdrop-blur-sm transition-colors duration-150 hover:text-foreground md:bottom-6 md:right-6"
      :aria-label="'Back to top'"
      @click="toTop"
    >
      <ArrowUp class="h-4 w-4" />
    </button>
  </Transition>
</template>
