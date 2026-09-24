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
  <div class="flex flex-wrap items-center justify-start gap-1" :class="variant === 'card' ? 'justify-center' : ''">
    <a
      v-for="link in links"
      :key="link.label"
      :href="link.href"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="link.label"
      :title="link.label"
      class="group inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-zinc-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-zinc-800"
    >
      <img
        :src="link.icon"
        :alt="link.label"
        loading="lazy"
        class="object-contain opacity-75 transition-opacity duration-150 group-hover:opacity-100"
        :class="size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'"
      />
    </a>
  </div>
</template>
