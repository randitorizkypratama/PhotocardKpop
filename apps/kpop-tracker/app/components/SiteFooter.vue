<template>
  <footer class="border-t border-slate-200/50 bg-white/50 py-6 backdrop-blur dark:border-slate-800/50 dark:bg-black/50">
    <div class="mx-auto flex max-w-7xl flex-col items-center gap-5 px-4">
      <div class="flex flex-wrap items-center justify-center gap-5">
        <div class="flex items-center gap-2.5">
          <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-9 w-9 rounded-full object-contain" />
          <span class="text-sm font-semibold text-slate-700 dark:text-slate-300">HIBIKISHOP</span>
        </div>
        <SocialLinks size="sm" />
      </div>

      <p class="max-w-2xl text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
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

      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
        <a href="https://www.tokopedia.com/hibikishop" target="_blank" rel="noopener noreferrer" class="hover:text-[#03AC0E]">Tokopedia</a>
        <span aria-hidden="true">·</span>
        <a href="https://id.shp.ee/jxkat4oC" target="_blank" rel="noopener noreferrer" class="hover:text-[#EE4D2D]">Shopee</a>
        <span aria-hidden="true">·</span>
        <a href="https://www.tiktok.com/@hibikis13" target="_blank" rel="noopener noreferrer" class="hover:text-slate-700 dark:hover:text-slate-300">TikTok @hibikis13</a>
        <span aria-hidden="true">·</span>
        <span>K-Pop Photocard Tracker</span>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
const year = new Date().getFullYear()
</script>
