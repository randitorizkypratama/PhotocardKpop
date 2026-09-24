interface CollectionItem {
  id: number
  card_id: number
  status: 'owned' | 'wishlist'
  bought_price: number | null
  added_at: string
  name: string
  image: string
  group_name: string
  member_name: string
  card_type: string
  last_price: number
  last_discounted_price: number
}

interface CollectionStats {
  totalOwned: number
  totalWishlist: number
  totalOwnedValue: number
  totalWishlistValue: number
}

interface CollectionResponse {
  success: boolean
  data: CollectionItem[]
  stats: CollectionStats
}

export function useCollection() {
  const items = useState<CollectionItem[]>('collection-items', () => [])
  const stats = useState<CollectionStats>('collection-stats', () => ({
    totalOwned: 0,
    totalWishlist: 0,
    totalOwnedValue: 0,
    totalWishlistValue: 0,
  }))
  const loading = useState<boolean>('collection-loading', () => false)
  const error = useState<string | null>('collection-error', () => null)
  const loaded = useState<boolean>('collection-loaded', () => false)
  const pendingCardIds = useState<Set<number>>('collection-pending', () => new Set())

  const wishlistIds = computed(() => {
    const set = new Set<number>()
    for (const item of items.value) {
      if (item.status === 'wishlist') set.add(item.card_id)
    }
    return set
  })

  const ownedIds = computed(() => {
    const set = new Set<number>()
    for (const item of items.value) {
      if (item.status === 'owned') set.add(item.card_id)
    }
    return set
  })

  const allIds = computed(() => new Set(items.value.map(item => item.card_id)))

  async function fetchCollection(force = false) {
    if (loaded.value && !force) return
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<CollectionResponse>('/api/collection')

      if (response.success) {
        items.value = response.data
        stats.value = response.stats
        loaded.value = true
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch collection'
    } finally {
      loading.value = false
    }
  }

  async function addToCollection(cardId: number, status: 'owned' | 'wishlist' = 'wishlist', boughtPrice?: number) {
    if (pendingCardIds.value.has(cardId)) return false
    pendingCardIds.value.add(cardId)
    try {
      await $fetch('/api/collection', {
        method: 'POST',
        body: {
          card_id: cardId,
          status,
          bought_price: boughtPrice,
        },
      })
      await fetchCollection(true)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to add to collection'
      return false
    } finally {
      pendingCardIds.value.delete(cardId)
    }
  }

  async function removeFromCollection(collectionId: number, status?: 'owned' | 'wishlist') {
    try {
      const query = status ? `?status=${status}` : ''
      await $fetch(`/api/collection/${collectionId}${query}`, {
        method: 'DELETE',
      })
      await fetchCollection(true)
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to remove from collection'
      return false
    }
  }

  function findItemByCardId(cardId: number, status?: 'owned' | 'wishlist') {
    if (status) {
      return items.value.find(item => item.card_id === cardId && item.status === status) ?? null
    }
    return items.value.find(item => item.card_id === cardId) ?? null
  }

  async function toggleWishlist(cardId: number) {
    if (pendingCardIds.value.has(cardId)) return false
    const wish = findItemByCardId(cardId, 'wishlist')
    if (wish) {
      return removeFromCollection(wish.id)
    }
    return addToCollection(cardId, 'wishlist')
  }

  return {
    items,
    stats,
    loading,
    error,
    loaded,
    wishlistIds,
    ownedIds,
    allIds,
    fetchCollection,
    addToCollection,
    removeFromCollection,
    toggleWishlist,
    findItemByCardId,
  }
}
