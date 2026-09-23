<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md'; variant?: 'plain' | 'card' }>(), {
  size: 'md',
  variant: 'plain',
})

const links = [
  {
    label: 'Tokopedia',
    href: 'https://www.tokopedia.com/hibikishop',
    icon: '/social/tokopedia.png',
  },
  {
    label: 'Shopee',
    href: 'https://id.shp.ee/jxkat4oC',
    icon: '/social/shopee.svg',
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@hibikis13',
    icon: '/social/tiktok.svg',
  },
]
</script>

<template>
  <div class="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
    <a
      v-for="link in links"
      :key="link.label"
      :href="link.href"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="link.label"
      :title="link.label"
      class="group inline-flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5 transition-all hover:-translate-y-1 hover:shadow-md dark:bg-white/10 dark:ring-white/10"
      :class="variant === 'card' ? 'min-w-[5.5rem]' : ''"
    >
      <span
        class="inline-flex items-center justify-center rounded-xl bg-slate-50 p-2 ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10"
        :class="size === 'sm' ? 'h-10 w-10' : 'h-12 w-12'"
      >
        <img
          :src="link.icon"
          :alt="link.label"
          loading="lazy"
          class="h-full w-full object-contain transition-transform group-hover:scale-110"
        />
      </span>
      <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">{{ link.label }}</span>
    </a>
  </div>
</template>
