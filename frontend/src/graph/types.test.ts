import { describe, expect, it } from 'vitest'
import { pageLayoutModeForWidth } from './types'

describe('pageLayoutModeForWidth — 8.13.5 RESPONSIVE breakpoints', () => {
  it('>1280px is full', () => {
    expect(pageLayoutModeForWidth(1920)).toBe('full')
    expect(pageLayoutModeForWidth(1281)).toBe('full')
  })

  it('1024-1280 inclusive is compact', () => {
    expect(pageLayoutModeForWidth(1280)).toBe('compact')
    expect(pageLayoutModeForWidth(1024)).toBe('compact')
    expect(pageLayoutModeForWidth(1150)).toBe('compact')
  })

  it('768-1024 (exclusive of 1024) is sheet', () => {
    expect(pageLayoutModeForWidth(1023)).toBe('sheet')
    expect(pageLayoutModeForWidth(768)).toBe('sheet')
    expect(pageLayoutModeForWidth(900)).toBe('sheet')
  })

  it('<768 is mobile', () => {
    expect(pageLayoutModeForWidth(767)).toBe('mobile')
    expect(pageLayoutModeForWidth(375)).toBe('mobile')
    expect(pageLayoutModeForWidth(0)).toBe('mobile')
  })
})
