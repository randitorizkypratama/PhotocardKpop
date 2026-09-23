<template>
  <footer class="border-t border-slate-200/50 bg-white/50 py-6 backdrop-blur dark:border-slate-800/50 dark:bg-black/50">
    <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row">
      <div class="flex items-center gap-2.5">
        <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-9 w-9 rounded-full object-contain" />
        <span class="text-sm font-semibold text-slate-700 dark:text-slate-300">HIBIKISHOP</span>
      </div>
      <p class="text-center text-xs text-slate-500 dark:text-slate-400">
        © {{ year }} Copyright by
        <span class="font-semibold text-slate-700 dark:text-slate-300">HIBIKISHOP</span>
        · Data based on
        <a
          href="https://pocamarket.com"
          target="_blank"
          rel="noopener noreferrer"
          class="font-semibold text-purple-600 underline-offset-2 hover:underline dark:text-purple-400"
        >POCAMARKET</a>
      </p>
      <p class="text-xs text-slate-400 dark:text-slate-500">K-Pop Photocard Tracker</p>
    </div>
  </footer>
</template>

<script setup lang="ts">
const year = new Date().getFullYear()
</script>
