import { describe, expect, test } from 'bun:test'
import { typeKey, groupByType, resolveFilter, filterItems, typeColors, TYPE_LABELS } from './index'

describe('typeKey', () => {
  test('labels, case and whitespace', () => {
    expect(typeKey('Outerwear')).toBe('outerwear')
    expect(typeKey('  JEANS ')).toBe('trousers')
    expect(typeKey('T-Shirt')).toBe('top')
    expect(typeKey('beanie')).toBe('hat')
    expect(typeKey('Hoodies')).toBe('outerwear')
    expect(typeKey('Boots')).toBe('shoes')
    expect(typeKey('Dresses')).toBe('dress')
  })
  test('unknown, empty and null are other', () => {
    expect(typeKey('Scarf')).toBe('other')
    expect(typeKey('')).toBe('other')
    expect(typeKey(null)).toBe('other')
  })
})

test('every key has a colour pair', () => {
  for (const k of [...TYPE_LABELS, 'other'] as const) expect(typeColors[k].bg).toMatch(/^#[0-9a-f]{6}$/)
})

test('groupByType counts in label order, other last, only present keys', () => {
  const items = [{ type: 'Scarf' }, { type: 'jeans' }, { type: 'Top' }, { type: 'Trousers' }]
  expect(groupByType(items)).toEqual([
    { key: 'top', count: 1 }, { key: 'trousers', count: 2 }, { key: 'other', count: 1 },
  ])
})

test('resolveFilter falls back to all when the filtered type is gone', () => {
  expect(resolveFilter('shoes', [{ key: 'top' }])).toBe('all')
  expect(resolveFilter('top', [{ key: 'top' }])).toBe('top')
  expect(resolveFilter('all', [])).toBe('all')
})

test('filterItems', () => {
  const items = [{ type: 'jeans' }, { type: 'Top' }, { type: 'Scarf' }]
  expect(filterItems(items, 'all')).toHaveLength(3)
  expect(filterItems(items, 'trousers')).toEqual([{ type: 'jeans' }])
  expect(filterItems(items, 'other')).toEqual([{ type: 'Scarf' }])
})
