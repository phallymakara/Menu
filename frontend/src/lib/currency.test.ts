import { describe, expect, it } from 'vitest'
import {
  calculateCashChange,
  convertUSDtoKHR,
  formatDualCurrency,
  formatKHR,
  formatUSD,
  roundKHRToHundred,
} from './currency'

describe('roundKHRToHundred', () => {
  it('rounds to the nearest 100 riel', () => {
    expect(roundKHRToHundred(51_249)).toBe(51_200)
    expect(roundKHRToHundred(51_250)).toBe(51_300)
    expect(roundKHRToHundred(49)).toBe(0)
  })
})

describe('formatting', () => {
  it('formats USD with two decimals and handles bad input', () => {
    expect(formatUSD(12.5)).toBe('$12.50')
    expect(formatUSD('3')).toBe('$3.00')
    expect(formatUSD(null)).toBe('$0.00')
    expect(formatUSD('abc')).toBe('$0.00')
  })

  it('formats KHR with 100-riel rounding by default', () => {
    expect(formatKHR(51_249)).toBe('៛51,200')
    expect(formatKHR(51_249, false)).toBe('៛51,249')
    expect(formatKHR(undefined)).toBe('៛0')
  })

  it('formats a dual-currency string', () => {
    expect(formatDualCurrency(12.5, 4100)).toBe('$12.50 / ៛51,300')
  })

  it('converts USD to rounded KHR', () => {
    expect(convertUSDtoKHR(2.49, 4100)).toBe(10_200)
  })
})

describe('calculateCashChange', () => {
  it('reports a shortage when tender is insufficient', () => {
    const result = calculateCashChange(10, 5, 4100, 4100)
    expect(result.isSufficient).toBe(false)
    expect(result.shortageUSD).toBeCloseTo(4)
    expect(result.changeUSD).toBe(0)
    expect(result.changeKHR).toBe(0)
  })

  it('returns whole dollars plus the remainder in rounded riel for USD preference', () => {
    // Tender $20 for a $12.30 bill: $7 back plus $0.70 as riel (2,870 -> 2,900).
    const result = calculateCashChange(12.3, 20, 0, 4100, 'USD')
    expect(result.isSufficient).toBe(true)
    expect(result.changeUSD).toBe(7)
    expect(result.changeKHR).toBe(2_900)
  })

  it('returns all change in riel for KHR preference', () => {
    const result = calculateCashChange(12.3, 20, 0, 4100, 'KHR')
    expect(result.changeUSD).toBe(0)
    expect(result.changeKHR).toBe(31_600)
  })

  it('counts mixed USD and KHR tender', () => {
    const result = calculateCashChange(10, 5, 20_500, 4100, 'USD')
    expect(result.totalTenderedUSD).toBeCloseTo(10)
    expect(result.isSufficient).toBe(true)
    expect(result.changeUSD).toBe(0)
    expect(result.changeKHR).toBe(0)
  })
})
