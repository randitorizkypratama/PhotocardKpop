<script setup lang="ts">
import { Heart } from 'lucide-vue-next'
import { formatIDR, formatUSD, groupAccent, groupDot } from '@/lib/catalog'

interface PhotocardCardData {
  id: number | string
  name: string
  image: string
  member_name: string
  group_name: string
  card_type?: string
  release_name?: string | null
  price?: number
  discounted_price?: number | null
  discount_rate?: number
  is_in_promotion?: boolean
}

const props = withDefaults(
  defineProps<{
    card: PhotocardCardData
    rate?: number
    showWishlist?: boolean
    wishlisted?: boolean
    badge?: string | null
  }>(),
  {
    rate: undefined,
    showWishlist: false,
    wishlisted: false,
    badge: null,
  },
)

const emit = defineEmits<{
  (e: 'wishlist', id: PhotocardCardData['id']): void
}>()

const effectivePrice = computed(() => {
  const discounted = Number(props.card.discounted_price) || 0
  const price = Number(props.card.price) || 0
  return discounted || price
})

const showPromo = computed(() => {
  if (props.card.is_in_promotion && props.card.discount_rate) return true
  const discounted = Number(props.card.discounted_price) || 0
  const price = Number(props.card.price) || 0
  return discounted > 0 && price > 0 && discounted < price
})

const promoRate = computed(() => {
  if (props.card.discount_rate) return props.card.discount_rate
  const discounted = Number(props.card.discounted_price) || 0
  const price = Number(props.card.price) || 0
  if (!price || !discounted || discounted >= price) return 0
  return Math.round((1 - discounted / price) * 100)
})

const memberAccent = computed(() => groupAccent(props.card.group_name))
const memberDot = computed(() => groupDot(props.card.group_name))
</script>

<template>
  <article class="group pc-card min-w-0">
    <NuxtLink
      :to="`/card/${card.id}`"
      class="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      :aria-label="`${card.name} — ${card.member_name}, ${card.group_name}`"
    >
      <div class="pc-card-image">
        <img
          :src="card.image"
          :alt="`${card.name} photocard`"
          loading="lazy"
          decoding="async"
          class="h-full w-full object-cover object-top transition-transform duration-200 ease-out group-hover:scale-[1.02]"
        />

        <div class="absolute left-2 top-2 flex flex-wrap gap-1">
          <span
            v-if="showPromo"
            class="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
          >
            -{{ promoRate }}%
          </span>
          <span
            v-if="badge"
            class="rounded-md border border-zinc-200 bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200"
          >
            {{ badge }}
          </span>
        </div>

        <span
          v-if="card.release_name"
          class="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md border border-zinc-200 bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300"
        >
          {{ card.release_name }}
        </span>
      </div>

      <div class="flex flex-1 flex-col gap-1 p-3">
        <div class="flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="memberDot" />
          <p class="truncate text-[11px] font-medium uppercase tracking-wide" :class="memberAccent">
            {{ card.member_name }}
          </p>
        </div>

        <h3 class="line-clamp-2 min-h-[2.25rem] text-[13px] font-medium leading-snug text-foreground">
          {{ card.name }}
        </h3>

        <p class="truncate text-[11px] text-muted-foreground">
          {{ card.group_name }}<template v-if="card.card_type"> · {{ card.card_type }}</template>
        </p>

        <div class="mt-auto pt-2">
          <template v-if="effectivePrice > 0">
            <div class="flex flex-wrap items-baseline gap-1.5">
              <span class="text-sm font-semibold tabular-nums text-foreground">
                Rp {{ formatIDR(effectivePrice, rate) }}
              </span>
              <span v-if="showPromo && Number(card.price) > 0" class="text-[11px] text-muted-foreground line-through">
                Rp {{ formatIDR(card.price, rate) }}
              </span>
            </div>
            <p class="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
              {{ formatUSD(effectivePrice) }}
            </p>
          </template>
          <span v-else class="text-[13px] text-muted-foreground">Tidak tersedia</span>
        </div>
      </div>
    </NuxtLink>

    <button
      v-if="showWishlist"
      type="button"
      class="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white/90 text-zinc-500 opacity-100 shadow-sm backdrop-blur-sm transition duration-150 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-400"
      :class="wishlisted ? 'text-rose-500 sm:opacity-100' : ''"
      :aria-label="wishlisted ? 'Remove from wishlist' : 'Add to wishlist'"
      :aria-pressed="wishlisted"
      @click.prevent.stop="emit('wishlist', card.id)"
    >
      <Heart class="h-4 w-4" :fill="wishlisted ? 'currentColor' : 'none'" />
    </button>
  </article>
</template>
