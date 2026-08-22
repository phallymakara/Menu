/**
 * Cambodian Dual-Currency Utilities (USD & 100-Riel KHR)
 */

export const DEFAULT_EXCHANGE_RATE = 4100

/**
 * Rounds a KHR number to the nearest 100 Riel (standard Cambodian retail convention).
 */
export function roundKHRToHundred(amount: number): number {
  return Math.round(amount / 100) * 100
}

/**
 * Formats a numeric USD amount into a clean currency string: e.g. $12.50
 */
export function formatUSD(amount: number | string | null | undefined): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Formats a numeric KHR amount into a clean currency string with 100-Riel rounding: e.g. ៛51,300
 */
export function formatKHR(amount: number | string | null | undefined, autoRound: boolean = true): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  if (isNaN(num)) return '៛0'
  const rounded = autoRound ? roundKHRToHundred(num) : Math.round(num)
  return `៛${rounded.toLocaleString('en-US')}`
}

/**
 * Formats USD and KHR in a unified dual-currency display string: e.g. $12.50 / ៛51,300
 */
export function formatDualCurrency(
  amountUSD: number | string | null | undefined,
  exchangeRate: number = DEFAULT_EXCHANGE_RATE
): string {
  const usdNum = typeof amountUSD === 'string' ? parseFloat(amountUSD) : (amountUSD ?? 0)
  const usdFormatted = formatUSD(usdNum)
  const khrFormatted = formatKHR(usdNum * exchangeRate)
  return `${usdFormatted} / ${khrFormatted}`
}

/**
 * Converts USD to KHR with 100-Riel rounding.
 */
export function convertUSDtoKHR(
  amountUSD: number,
  exchangeRate: number = DEFAULT_EXCHANGE_RATE
): number {
  return roundKHRToHundred(amountUSD * exchangeRate)
}

/**
 * Calculates change breakdown for mixed multi-currency tendering.
 */
export function calculateCashChange(
  totalUSD: number,
  tenderedUSD: number = 0,
  tenderedKHR: number = 0,
  exchangeRate: number = DEFAULT_EXCHANGE_RATE,
  changePreference: 'USD' | 'KHR' = 'USD'
): {
  totalTenderedUSD: number
  changeUSD: number
  changeKHR: number
  isSufficient: boolean
  shortageUSD: number
} {
  const khrInUSD = tenderedKHR / exchangeRate
  const totalTenderedUSD = tenderedUSD + khrInUSD
  const isSufficient = totalTenderedUSD >= totalUSD

  if (!isSufficient) {
    return {
      totalTenderedUSD,
      changeUSD: 0,
      changeKHR: 0,
      isSufficient: false,
      shortageUSD: totalUSD - totalTenderedUSD,
    }
  }

  const changeRawUSD = totalTenderedUSD - totalUSD

  if (changePreference === 'USD') {
    const wholeUSD = Math.floor(changeRawUSD)
    const fractionalUSD = changeRawUSD - wholeUSD
    const changeKHR = roundKHRToHundred(fractionalUSD * exchangeRate)
    return {
      totalTenderedUSD,
      changeUSD: wholeUSD,
      changeKHR,
      isSufficient: true,
      shortageUSD: 0,
    }
  } else {
    // Return all change in KHR
    const changeKHR = roundKHRToHundred(changeRawUSD * exchangeRate)
    return {
      totalTenderedUSD,
      changeUSD: 0,
      changeKHR,
      isSufficient: true,
      shortageUSD: 0,
    }
  }
}
