<script setup lang="ts">
import { Heart } from 'lucide-vue-next'
import { formatIDR, formatUSD, groupDot } from '@/lib/catalog'
import { cardTypeLabel } from '@/lib/cardTypes'

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

const typeLabel = computed(() => cardTypeLabel(props.card.card_type))
const memberDot = computed(() => groupDot(props.card.group_name))
const releaseLine = computed(() => {
  const release = props.card.release_name?.trim()
  if (!release) return ''
  const type = typeLabel.value
  if (type && release.toUpperCase() === type.toUpperCase()) return ''
  return release
})
</script>

<template>
  <article class="group pc-card min-w-0">
    <NuxtLink
      :to="`/card/${card.id}`"
      class="flex h-full flex-col focus-visible:outline-none"
      :aria-label="`${typeLabel ? `${typeLabel}. ` : ''}${card.name} — ${card.member_name}, ${card.group_name}`"
    >
      <div class="pc-card-image">
        <img
          :src="card.image"
          :alt="`${card.name} photocard`"
          loading="lazy"
          decoding="async"
          class="h-full w-full object-cover object-top"
        />

        <div class="absolute left-2 top-2 flex flex-col items-start gap-1">
          <span v-if="typeLabel" class="pc-type-badge">{{ typeLabel }}</span>
          <span v-if="badge" class="pc-status-badge">{{ badge }}</span>
        </div>
      </div>

      <div class="flex flex-1 flex-col p-3">
        <div class="flex items-baseline justify-between gap-2">
          <p class="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground">
            {{ card.member_name }}
          </p>
          <span class="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span class="h-1.5 w-1.5 rounded-full" :class="memberDot" aria-hidden="true" />
            {{ card.group_name }}
          </span>
        </div>

        <h3 class="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
          {{ card.name }}
        </h3>

        <p v-if="releaseLine" class="mt-1 truncate text-[11px] text-muted-foreground">
          {{ releaseLine }}
        </p>

        <div class="mt-auto pt-3">
          <p class="pc-meta-label">Market reference</p>
          <template v-if="effectivePrice > 0">
            <div class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span class="text-[13px] font-medium tabular-nums text-foreground">
                Rp {{ formatIDR(effectivePrice, rate) }}
              </span>
              <span class="text-[11px] tabular-nums text-muted-foreground">
                {{ formatUSD(effectivePrice) }}
              </span>
              <span v-if="showPromo" class="text-[11px] font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                −{{ promoRate }}%
              </span>
            </div>
          </template>
          <p v-else class="mt-1 text-[12px] text-muted-foreground">Not available</p>
        </div>
      </div>
    </NuxtLink>

    <button
      v-if="showWishlist"
      type="button"
      class="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white/95 text-zinc-500 shadow-sm backdrop-blur-sm transition duration-150 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 dark:border-zinc-700 dark:bg-zinc-950/90 dark:text-zinc-400"
      :class="wishlisted ? 'text-rose-500 sm:opacity-100' : ''"
      :aria-label="wishlisted ? 'Remove from wishlist' : 'Add to wishlist'"
      :aria-pressed="wishlisted"
      @click.prevent.stop="emit('wishlist', card.id)"
    >
      <Heart class="h-4 w-4" :fill="wishlisted ? 'currentColor' : 'none'" />
    </button>
  </article>
</template>
