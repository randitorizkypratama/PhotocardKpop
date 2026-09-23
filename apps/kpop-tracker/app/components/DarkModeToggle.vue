<script setup lang="ts">
import { Sun, Moon } from 'lucide-vue-next'

const { isDark, toggle } = useDarkMode()
</script>

<template>
  <button
    class="glass-card flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition-all hover:shadow-md dark:text-slate-300"
    :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggle"
  >
    <Sun v-if="isDark" class="h-4 w-4" />
    <Moon v-else class="h-4 w-4" />
  </button>
</template>
