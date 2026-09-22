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
  const items = ref<CollectionItem[]>([])
  const stats = ref<CollectionStats>({
    totalOwned: 0,
    totalWishlist: 0,
    totalOwnedValue: 0,
    totalWishlistValue: 0,
  })
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchCollection() {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<CollectionResponse>('/api/collection')

      if (response.success) {
        items.value = response.data
        stats.value = response.stats
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch collection'
    } finally {
      loading.value = false
    }
  }

  async function addToCollection(cardId: number, status: 'owned' | 'wishlist' = 'wishlist', boughtPrice?: number) {
    try {
      await $fetch('/api/collection', {
        method: 'POST',
        body: {
          card_id: cardId,
          status,
          bought_price: boughtPrice,
        },
      })
      await fetchCollection()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to add to collection'
      return false
    }
  }

  async function removeFromCollection(collectionId: number) {
    try {
      await $fetch(`/api/collection/${collectionId}`, {
        method: 'DELETE',
      })
      await fetchCollection()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to remove from collection'
      return false
    }
  }

  return {
    items,
    stats,
    loading,
    error,
    fetchCollection,
    addToCollection,
    removeFromCollection,
  }
}
