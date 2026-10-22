import { describe, expect, test } from 'bun:test'

import { decide, type Prediction } from './suggestion'

const p: Prediction[] = [
  { label: 'shoes', confidence: 0.9 },
  { label: 'bag', confidence: 0.06 },
  { label: 'hat', confidence: 0.03 },
]

describe('decide', () => {
  test('pre-fills an empty field above the threshold', () => {
    expect(decide(p, 0.8, '', null)).toEqual({ prefill: 'Shoes', chips: ['Shoes', 'Bag', 'Hat'] })
  })

  test('no pre-fill below the threshold, chips still shown', () => {
    expect(decide(p, 0.95, '', null)).toEqual({ prefill: null, chips: ['Shoes', 'Bag', 'Hat'] })
  })

  test('pre-fills at exactly the threshold', () => {
    expect(decide(p, 0.9, '', null).prefill).toBe('Shoes')
  })

  test('keeps a saved type', () => {
    expect(decide(p, 0.8, 'Sneakers', null).prefill).toBeNull()
  })

  test('keeps a type the user changed after a pre-fill', () => {
    expect(decide(p, 0.8, 'Boots', 'Hat').prefill).toBeNull()
  })

  test('replaces its own earlier pre-fill', () => {
    expect(decide(p, 0.8, 'Hat', 'Hat').prefill).toBe('Shoes')
  })

  test('a whitespace-only field counts as empty', () => {
    expect(decide(p, 0.8, '  ', null).prefill).toBe('Shoes')
  })

  test('fewer than three predictions', () => {
    expect(decide(p.slice(0, 1), 0.8, '', null).chips).toEqual(['Shoes'])
  })

  test('the placeholder threshold of 1 never pre-fills', () => {
    expect(decide(p, 1, '', null).prefill).toBeNull()
  })

  test('a threshold of 1 never pre-fills, even at confidence 1', () => {
    expect(decide([{ label: 'shoes', confidence: 1 }], 1, '', null).prefill).toBeNull()
  })
})
