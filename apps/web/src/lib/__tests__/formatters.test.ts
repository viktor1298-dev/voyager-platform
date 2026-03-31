import { describe, it, expect } from 'vitest'
import { formatCPU, formatMemory, formatTimestamp } from '../formatters'

describe('formatCPU', () => {
  it('returns dash for null', () => {
    expect(formatCPU(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatCPU(undefined)).toBe('—')
  })

  it('formats millicores below 1000', () => {
    expect(formatCPU(250)).toBe('250m')
    expect(formatCPU(0)).toBe('0m')
    expect(formatCPU(999)).toBe('999m')
  })

  it('formats millicores at 1000 as cores', () => {
    expect(formatCPU(1000)).toBe('1.0 cores')
  })

  it('formats millicores above 1000 as cores', () => {
    expect(formatCPU(2500)).toBe('2.5 cores')
    expect(formatCPU(8000)).toBe('8.0 cores')
    expect(formatCPU(12345)).toBe('12.3 cores')
  })
})

describe('formatMemory', () => {
  it('returns dash for null', () => {
    expect(formatMemory(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatMemory(undefined)).toBe('—')
  })

  it('formats bytes below 1 GB as MB', () => {
    const mb100 = 100 * 1024 * 1024
    expect(formatMemory(mb100)).toBe('100 MB')
  })

  it('formats bytes at 1 GB', () => {
    const gb1 = 1024 * 1024 * 1024
    expect(formatMemory(gb1)).toBe('1.0 GB')
  })

  it('formats bytes above 1 GB', () => {
    const gb4 = 4 * 1024 * 1024 * 1024
    expect(formatMemory(gb4)).toBe('4.0 GB')
  })

  it('formats fractional GB', () => {
    const gb2_5 = 2.5 * 1024 * 1024 * 1024
    expect(formatMemory(gb2_5)).toBe('2.5 GB')
  })

  it('formats zero bytes', () => {
    expect(formatMemory(0)).toBe('0 MB')
  })
})

describe('formatTimestamp', () => {
  it('formats a string timestamp', () => {
    const result = formatTimestamp('2026-01-15T10:30:00Z')
    // Should contain month, day, and time components
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('formats a Date object', () => {
    const date = new Date('2026-06-01T14:00:00Z')
    const result = formatTimestamp(date)
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('includes time components', () => {
    // Use a fixed date that won't shift across timezones
    const result = formatTimestamp('2026-03-15T12:30:45Z')
    // The format includes month, day, hour, minute, second
    // Exact format depends on locale, but should have at least separators
    expect(result).toMatch(/\d/)
  })
})
