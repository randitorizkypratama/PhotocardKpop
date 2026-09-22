export default defineEventHandler(async () => {
  const rates = await fetchExchangeRates()

  if (!rates) {
    return {
      success: false,
      message: 'Failed to fetch exchange rates',
    }
  }

  return {
    success: true,
    data: rates,
  }
})
