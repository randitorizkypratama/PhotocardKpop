<script setup lang="ts">
import { Home, LayoutGrid, Users, Heart } from 'lucide-vue-next'

const route = useRoute()

const tabs = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/browse', label: 'Catalog', icon: LayoutGrid },
  { to: '/#groups', label: 'Groups', icon: Users },
  { to: '/collection', label: 'Collection', icon: Heart },
]

function isActive(to: string) {
  if (to === '/') return route.path === '/' && !route.hash
  if (to === '/#groups') return route.path === '/' && route.hash === '#groups'
  if (to === '/browse') {
    return (
      route.path.startsWith('/browse') ||
      route.path.startsWith('/card') ||
      route.path.startsWith('/groups')
    )
  }
  return route.path.startsWith(to)
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-background/95 backdrop-blur-md md:hidden dark:border-zinc-800"
    style="padding-bottom: env(safe-area-inset-bottom, 0px)"
    aria-label="Mobile"
  >
    <div class="flex h-14 items-stretch">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        :class="[
          'relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150',
          isActive(tab.to)
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        ]"
        :aria-current="isActive(tab.to) ? 'page' : undefined"
      >
        <component :is="tab.icon" class="h-5 w-5" :stroke-width="isActive(tab.to) ? 2.25 : 1.75" />
        <span class="text-[10px] font-medium">{{ tab.label }}</span>
        <span
          v-if="isActive(tab.to)"
          class="absolute top-0 h-0.5 w-8 rounded-full bg-foreground"
        />
      </NuxtLink>
    </div>
  </nav>
</template>
