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
  <div class="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
    <a
      v-for="link in links"
      :key="link.label"
      :href="link.href"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="link.label"
      :title="link.label"
      class="group inline-flex items-center justify-center rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-white/10 dark:ring-white/10"
      :class="size === 'sm' ? 'h-12 w-12' : 'h-14 w-14'"
    >
      <img
        :src="link.icon"
        :alt="link.label"
        loading="lazy"
        class="h-full w-full object-contain transition-transform group-hover:scale-105"
      />
    </a>
  </div>
</template>
