<script setup lang="ts">
import { Home, LayoutGrid, Heart } from 'lucide-vue-next'

const route = useRoute()

const tabs = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/browse', label: 'Browse', icon: LayoutGrid },
  { to: '/collection', label: 'Collection', icon: Heart },
]

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  if (to === '/browse') return route.path.startsWith('/browse') || route.path.startsWith('/card')
  return route.path.startsWith(to)
}</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-50 border-t border-white/20 glass md:hidden"
    style="padding-bottom: env(safe-area-inset-bottom, 0px)"
  >
    <div class="flex h-14 items-stretch">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        :class="[
          'relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors',
          isActive(tab.to)
            ? 'text-purple-600 dark:text-purple-400'
            : 'text-slate-400 dark:text-slate-500'
        ]"
      >
        <component :is="tab.icon" class="h-5 w-5" :stroke-width="isActive(tab.to) ? 2.5 : 2" />
        <span class="text-[10px] font-medium">{{ tab.label }}</span>
        <span
          v-if="isActive(tab.to)"
          class="absolute bottom-0 h-0.5 w-8 rounded-full bg-purple-600 dark:bg-purple-400"
        />
      </NuxtLink>
    </div>
  </nav>
</template>
