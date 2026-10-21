export default cachedEventHandler(
  async () => {
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
  },
  {
    // Bank rates move once a day — every page load used to hit Frankfurter
    // live for a number that then only feeds the display formatting.
    swr: true,
    maxAge: 60 * 60,
  },
)
