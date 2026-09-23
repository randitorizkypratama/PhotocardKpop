<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md'; variant?: 'plain' | 'card' }>(), {
  size: 'md',
  variant: 'plain',
})

const links = [
  {
    label: 'Tokopedia',
    href: 'https://www.tokopedia.com/hibikishop',
    icon: '/social/tokopedia.svg',
    wide: true,
  },
  {
    label: 'Shopee',
    href: 'https://id.shp.ee/jxkat4oC',
    icon: '/social/shopee.svg',
    wide: false,
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@hibikis13',
    icon: '/social/tiktok.svg',
    wide: false,
  },
]
</script>

<template>
  <div class="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
    <a
      v-for="link in links"
      :key="link.label"
      :href="link.href"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="link.label"
      :title="link.label"
      :class="[
        'group inline-flex items-center justify-center transition-all hover:-translate-y-0.5 hover:shadow-lg',
        link.wide
          ? 'rounded-full px-3'
          : 'rounded-full',
        size === 'sm'
          ? (link.wide ? 'h-9 min-w-[3.5rem]' : 'h-9 w-9')
          : (link.wide ? 'h-11 min-w-[4.5rem]' : 'h-11 w-11'),
        variant === 'card'
          ? 'bg-white shadow-sm dark:bg-white/10'
          : 'bg-white/90 shadow-sm backdrop-blur dark:bg-black/40'
      ]"
    >
      <img
        :src="link.icon"
        :alt="link.label"
        loading="lazy"
        :class="[
          'object-contain transition-transform group-hover:scale-105',
          link.wide
            ? (size === 'sm' ? 'h-4 w-auto max-w-[4rem]' : 'h-5 w-auto max-w-[5.5rem]')
            : (size === 'sm' ? 'h-5 w-5' : 'h-6 w-6')
        ]"
      />
    </a>
  </div>
</template>
