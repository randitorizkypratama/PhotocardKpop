<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md'; variant?: 'plain' | 'card' }>(), {
  size: 'md',
  variant: 'plain',
})

const links = [
  {
    label: 'Tokopedia',
    href: 'https://www.tokopedia.com/hibikishop',
    color: '#03AC0E',
    icon: 'tokopedia',
  },
  {
    label: 'Shopee',
    href: 'https://id.shp.ee/jxkat4oC',
    color: '#EE4D2D',
    icon: 'shopee',
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@hibikis13',
    color: '#010101',
    icon: 'tiktok',
  },
]
</script>

<template>
  <div class="flex items-center gap-2" :class="variant === 'card' ? 'justify-center' : ''">
    <a
      v-for="link in links"
      :key="link.label"
      :href="link.href"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="link.label"
      :title="link.label"
      :class="[
        'group inline-flex items-center justify-center rounded-full transition-all hover:-translate-y-0.5 hover:shadow-lg',
        size === 'sm' ? 'h-9 w-9' : 'h-11 w-11',
        variant === 'card'
          ? 'bg-white shadow-sm dark:bg-white/10'
          : 'bg-white/90 shadow-sm backdrop-blur dark:bg-black/40'
      ]"
    >
      <span
        class="flex items-center justify-center rounded-full"
        :class="size === 'sm' ? 'h-6 w-6' : 'h-7 w-7'"
        :style="{ backgroundColor: link.color }"
      >
        <!-- Tokopedia -->
        <svg v-if="link.icon === 'tokopedia'" viewBox="0 0 24 24" class="h-4 w-4 text-white sm:h-[18px] sm:w-[18px]" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.2 14.4H8.4V9.2h2.4v7.2zm4.8 0h-2.4V9.2H16v7.2z" />
        </svg>
        <!-- Shopee bag -->
        <svg v-else-if="link.icon === 'shopee'" viewBox="0 0 24 24" class="h-4 w-4 text-white sm:h-[18px] sm:w-[18px]" fill="currentColor" aria-hidden="true">
          <path d="M16.5 7.5h-1.1l-.7-1.4A2.5 2.5 0 0 0 12.4 4.7h-.8a2.5 2.5 0 0 0-2.3 1.4l-.7 1.4H7.5A1.5 1.5 0 0 0 6 9v9a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 18V9a1.5 1.5 0 0 0-1.5-1.5zM11.6 6.3a1 1 0 0 1 .9-.6h1a1 1 0 0 1 .9.6l.4.8h-3.6l.4-.8zM12 16.8a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z" />
        </svg>
        <!-- TikTok note -->
        <svg v-else viewBox="0 0 24 24" class="h-4 w-4 text-white sm:h-[18px] sm:w-[18px]" fill="currentColor" aria-hidden="true">
          <path d="M19.6 7.6a5.7 5.7 0 0 1-3.3-1.1v7.2a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v2.9a2.8 2.8 0 1 0 2 2.7V3h2.8c.2 1.6 1.2 3 2.6 3.7.6.3 1.3.5 2 .6v2.9c-.4 0-.8-.1-1.3-.2z" />
        </svg>
      </span>
    </a>
  </div>
</template>
