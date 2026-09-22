interface PriceHistory {
  id: number
  card_id: number
  price: number
  discounted_price: number
  wish_count: number
  sales_volume: number
  stocked_count: number
  recorded_at: string
}

interface PriceHistoryResponse {
  success: boolean
  data: PriceHistory[]
}

export function usePriceHistory() {
  const history = ref<PriceHistory[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPriceHistory(cardId: number) {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<PriceHistoryResponse>(`/api/cards/${cardId}/history`)

      if (response.success) {
        history.value = response.data
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch price history'
    } finally {
      loading.value = false
    }
  }

  function getPriceTrend() {
    if (history.value.length < 2) return 'stable'
    
    const latest = history.value[0].price
    const previous = history.value[1].price
    
    if (latest > previous) return 'up'
    if (latest < previous) return 'down'
    return 'stable'
  }

  function getPriceChange() {
    if (history.value.length < 2) return 0
    
    const latest = history.value[0].price
    const previous = history.value[1].price
    
    return latest - previous
  }

  return {
    history,
    loading,
    error,
    fetchPriceHistory,
    getPriceTrend,
    getPriceChange,
  }
}
