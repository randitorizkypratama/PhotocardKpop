export interface ExchangeRate {
  currency: string
  buyRate: number
  sellRate: number
  midRate: number
}

export interface ExchangeRateResponse {
  date: string
  usd: ExchangeRate
  myr: ExchangeRate
  fetchedAt: string
}

const FRANKFURTER_URL = 'https://api.frankfurter.dev/v2/providers/bi/rates'

export async function fetchExchangeRates(): Promise<ExchangeRateResponse | null> {
  try {
    const response = await fetch(FRANKFURTER_URL)
    if (!response.ok) return null

    const data = await response.json()
    const graph = data['@graph'] || []
    const rates: any[] = []

    for (const item of graph) {
      if (item.rates) {
        for (const rate of item.rates) {
          rates.push(rate)
        }
      }
    }

    const findRate = (currency: string) => {
      const rate = rates.find((r: any) => r.currency === currency)
      if (!rate) return null
      const buy = parseFloat(rate.buyRate || rate.value || '0')
      const sell = parseFloat(rate.sellRate || rate.value || '0')
      return {
        currency,
        buyRate: buy,
        sellRate: sell,
        midRate: (buy + sell) / 2 || buy || sell,
      }
    }

    const usd = findRate('USD')
    const myr = findRate('MYR')

    if (!usd && !myr) return null

    return {
      date: rates[0]?.date || new Date().toISOString().split('T')[0],
      usd: usd || { currency: 'USD', buyRate: 0, sellRate: 0, midRate: 0 },
      myr: myr || { currency: 'MYR', buyRate: 0, sellRate: 0, midRate: 0 },
      fetchedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function convertToIDR(usdPrice: number, rate: number): number {
  return usdPrice * rate
}
