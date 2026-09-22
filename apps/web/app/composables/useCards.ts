interface Card {
  id: number
  name: string
  image: string
  group_name: string
  member_name: string
  group_image: string
  member_image: string
  card_type: string
  price: number
  discounted_price: number
  discount_rate: number
  is_in_promotion: boolean
  wish_count: number
  sales_volume: number
  stocked_count: number
}

interface CardsResponse {
  success: boolean
  data: Card[]
  total: number
  page: number
  next_page: number | null
  source: string
}

export function useCards() {
  const cards = ref<Card[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const total = ref(0)
  const currentPage = ref(1)
  const hasNextPage = ref(false)

  async function fetchCards(group: string = 'IVE', page: number = 1, member?: string, append: boolean = false) {
    loading.value = true
    error.value = null

    try {
      const queryParams = new URLSearchParams({ group, page: String(page) })
      if (member) queryParams.append('member', member)

      const response = await $fetch<CardsResponse>(`/api/cards?${queryParams}`)

      if (response.success) {
        if (append && page > 1) {
          cards.value = [...cards.value, ...response.data]
        } else {
          cards.value = response.data
        }
        total.value = response.total || cards.value.length
        currentPage.value = page
        hasNextPage.value = response.next_page !== null
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch cards'
    } finally {
      loading.value = false
    }
  }

  function loadMore(group: string, member?: string) {
    if (hasNextPage.value && !loading.value) {
      fetchCards(group, currentPage.value + 1, member, true)
    }
  }

  return {
    cards,
    loading,
    error,
    total,
    currentPage,
    hasNextPage,
    fetchCards,
    loadMore,
  }
}
