import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { timeAgo } from './utils.js'

const NOW = new Date('2026-05-25T12:00:00Z').getTime()
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const min = (n: number) => n * 60_000
const h   = (n: number) => n * 60 * 60_000
const d   = (n: number) => n * 24 * 60 * 60_000

describe('timeAgo', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
  afterEach(()  => { vi.useRealTimers() })

  // ── Seuil "à l'instant" ────────────────────────────────────────────────────
  it('0s  → à l\'instant', () => expect(timeAgo(ago(0))).toBe('à l\'instant'))
  it('30s → à l\'instant', () => expect(timeAgo(ago(30_000))).toBe('à l\'instant'))
  it('59s → à l\'instant', () => expect(timeAgo(ago(59_000))).toBe('à l\'instant'))

  // ── Minutes ────────────────────────────────────────────────────────────────
  it('1min  → il y a 1min',  () => expect(timeAgo(ago(min(1)))).toBe('il y a 1min'))
  it('5min  → il y a 5min',  () => expect(timeAgo(ago(min(5)))).toBe('il y a 5min'))
  it('45min → il y a 45min', () => expect(timeAgo(ago(min(45)))).toBe('il y a 45min'))
  it('59min → il y a 59min', () => expect(timeAgo(ago(min(59)))).toBe('il y a 59min'))

  // ── Heures ─────────────────────────────────────────────────────────────────
  it('1h  → il y a 1h',  () => expect(timeAgo(ago(h(1)))).toBe('il y a 1h'))
  it('6h  → il y a 6h',  () => expect(timeAgo(ago(h(6)))).toBe('il y a 6h'))
  it('23h → il y a 23h', () => expect(timeAgo(ago(h(23)))).toBe('il y a 23h'))

  // ── Jours ──────────────────────────────────────────────────────────────────
  it('24h → il y a 1j', () => expect(timeAgo(ago(h(24)))).toBe('il y a 1j'))
  it('2j  → il y a 2j', () => expect(timeAgo(ago(d(2)))).toBe('il y a 2j'))
  it('7j  → il y a 7j', () => expect(timeAgo(ago(d(7)))).toBe('il y a 7j'))

  // ── Frontières exactes ──────────────────────────────────────────────────────
  it('60min - 1s → encore en minutes', () => expect(timeAgo(ago(min(60) - 1000))).toBe('il y a 59min'))
  it('60min      → bascule en heures',  () => expect(timeAgo(ago(min(60)))).toBe('il y a 1h'))
})
