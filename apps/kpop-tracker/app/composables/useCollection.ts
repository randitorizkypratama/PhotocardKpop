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
  /** Market value of owned cards: last_discounted_price || last_price. */
  totalOwnedValue: number
  totalWishlistValue: number
  /** Cost basis: sum of what the owner actually paid. Separate from market value on purpose. */
  totalOwnedCost: number
  /** Owned cards with no recorded price — the cost total is partial when this is > 0. */
  ownedWithoutCost: number
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
    totalOwnedCost: 0,
    ownedWithoutCost: 0,
  }))
  const loading = useState<boolean>('collection-loading', () => false)
  const error = useState<string | null>('collection-error', () => null)
  const loaded = useState<boolean>('collection-loaded', () => false)
  // Unlike `loaded`, this also settles for logged-out visitors, so the 401
  // from /api/collection is paid once per session instead of per page.
  const checked = useState<boolean>('collection-checked', () => false)
  const pendingCardIds = useState<Set<number>>('collection-pending', () => new Set())
  const { user, ensureChecked } = useAuth()
  const { push: toast } = useToast()
  const { t } = useLocale()

  // Switching account (login or logout) invalidates whatever was cached for
  // the previous one — otherwise a fresh login keeps showing the logged-out
  // empty state, since fetchCollection() would skip on `checked`.
  watch(() => user.value?.id ?? null, (id, previous) => {
    if (id === previous) return
    checked.value = false
    loaded.value = false
    items.value = []
    stats.value = { totalOwned: 0, totalWishlist: 0, totalOwnedValue: 0, totalWishlistValue: 0, totalOwnedCost: 0, ownedWithoutCost: 0 }
  })

  async function requireLogin(): Promise<boolean> {
    const current = await ensureChecked()
    if (!current) {
      const route = useRoute()
      navigateTo({ path: '/login', query: route.path === '/login' ? undefined : { next: route.fullPath } })
      return false
    }
    return true
  }

  function isUnauthorized(e: unknown): boolean {
    if (!e || typeof e !== 'object') return false
    const err = e as { statusCode?: number; status?: number; response?: { status?: number } }
    return err.statusCode === 401 || err.status === 401 || err.response?.status === 401
  }

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
    if (checked.value && !force) return
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<CollectionResponse>('/api/collection')

      if (response.success) {
        items.value = response.data
        stats.value = response.stats
        loaded.value = true
        checked.value = true
      }
    } catch (e) {
      if (isUnauthorized(e)) {
        items.value = []
        stats.value = { totalOwned: 0, totalWishlist: 0, totalOwnedValue: 0, totalWishlistValue: 0, totalOwnedCost: 0, ownedWithoutCost: 0 }
        loaded.value = false
        // Logged out is a settled answer, not a failure — stop asking.
        checked.value = true
        error.value = null
      } else {
        // Network / 5xx: leave `checked` false so the retry button still works.
        error.value = e instanceof Error ? e.message : 'Failed to fetch collection'
      }
    } finally {
      loading.value = false
    }
  }

  async function addToCollection(cardId: number, status: 'owned' | 'wishlist' = 'wishlist', boughtPrice?: number) {
    if (!(await requireLogin())) return false
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
      toast(t('toast.saved'))
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to add to collection'
      // A redirect to /login (requireLogin above) never reaches this catch,
      // so what lands here is genuinely a failed write worth surfacing.
      toast(t('toast.failed'), 'error')
      return false
    } finally {
      pendingCardIds.value.delete(cardId)
    }
  }

  async function removeFromCollection(collectionId: number, status?: 'owned' | 'wishlist') {
    if (!(await requireLogin())) return false
    try {
      const query = status ? `?status=${status}` : ''
      await $fetch(`/api/collection/${collectionId}${query}`, {
        method: 'DELETE',
      })
      await fetchCollection(true)
      toast(t('toast.removed'))
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to remove from collection'
      toast(t('toast.failed'), 'error')
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
