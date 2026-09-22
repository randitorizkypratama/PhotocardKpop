export interface ExchangeRate {
  rate: number
  convertedToIDR: number
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

    const findRate = (quote: string) => {
      return data.find((r: any) => r.quote === quote)
    }

    const idrRate = findRate('IDR')
    const usdRate = findRate('USD')
    const myrRate = findRate('MYR')

    if (!idrRate) return null

    const eurToIDR = idrRate.rate

    const usdToIDR = usdRate ? eurToIDR / usdRate.rate : 0
    const myrToIDR = myrRate ? eurToIDR / myrRate.rate : 0

    return {
      date: idrRate.date,
      usd: {
        rate: usdToIDR,
        convertedToIDR: usdToIDR,
      },
      myr: {
        rate: myrToIDR,
        convertedToIDR: myrToIDR,
      },
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
