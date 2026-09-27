<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import { formatIDR } from '@/lib/catalog'

interface MoverRow {
  id: number
  name: string
  image: string | null
  group_name: string
  member_name: string
  price: number
  prev_price: number
  delta_pct: number
}

const props = defineProps<{ rate?: number }>()
const { t } = useLocale()

const drops = ref<MoverRow[]>([])
const risers = ref<MoverRow[]>([])

onMounted(async () => {
  try {
    const response = await $fetch<{ success: boolean, data: { drops: MoverRow[], risers: MoverRow[] } }>('/api/movers')
    if (response?.success) {
      drops.value = response.data?.drops || []
      risers.value = response.data?.risers || []
    }
  } catch {
    // Section stays hidden when the endpoint fails.
  }
})

function pctLabel(value: number) {
  const rounded = Math.abs(value) < 10 ? Math.abs(value).toFixed(1) : String(Math.round(Math.abs(value)))
  return `${value < 0 ? '−' : '+'}${rounded}%`
}
</script>

<template>
  <section v-if="drops.length || risers.length" class="border-t border-zinc-200 dark:border-zinc-800">
    <div class="page-shell py-10 sm:py-12">
      <div class="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
        <div>
          <p class="eyebrow">{{ t('movers.eyebrow') }}</p>
          <h2 class="mt-1.5 section-title">{{ t('movers.title') }}</h2>
        </div>
        <NuxtLink
          to="/browse"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {{ t('browseAll') }}
          <ArrowRight class="h-4 w-4" />
        </NuxtLink>
      </div>

      <div class="grid gap-3 sm:gap-4 md:grid-cols-2">
          <div
            v-for="panel in [
              { title: 'movers.drops', items: drops, dot: 'bg-emerald-500', delta: 'text-emerald-700 dark:text-emerald-400' },
              { title: 'movers.risers', items: risers, dot: 'bg-rose-500', delta: 'text-rose-700 dark:text-rose-400' },
            ]"
          :key="panel.title"
          class="min-w-0 rounded-xl border border-zinc-200 bg-card shadow-sm dark:border-zinc-800"
        >
          <div class="flex items-center gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800/80">
            <span class="h-2 w-2 rounded-full" :class="panel.dot" aria-hidden="true" />
            <span class="text-sm font-medium text-foreground">{{ t(panel.title) }}</span>
            <span class="text-xs text-muted-foreground">{{ t('movers.vs') }}</span>
          </div>

          <div class="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            <NuxtLink
              v-for="item in panel.items"
              :key="`${panel.title}-${item.id}`"
              :to="`/card/${item.id}`"
              class="flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <span class="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                <img
                  v-if="item.image"
                  :src="item.image"
                  :alt="`${item.name} photocard`"
                  loading="lazy"
                  decoding="async"
                  class="h-full w-full object-cover object-top"
                />
              </span>

              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-medium text-foreground">{{ item.name }}</span>
                <span class="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {{ item.member_name }}<template v-if="item.member_name && item.group_name"> · </template>{{ item.group_name }}
                </span>
              </span>

              <span class="shrink-0 text-right">
                <span class="block text-[13px] font-medium tabular-nums text-foreground">
                  Rp {{ formatIDR(item.price, props.rate) }}
                </span>
                <span
                  class="mt-0.5 block text-[11px] font-medium tabular-nums"
                  :class="panel.delta"
                  :title="`Previous: Rp ${formatIDR(item.prev_price, props.rate)}`"
                >
                  {{ pctLabel(item.delta_pct) }}
                </span>
              </span>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
