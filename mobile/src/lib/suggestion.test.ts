import { describe, expect, test } from 'bun:test'

import { decide, lineText, type Prediction } from './suggestion'

const p: Prediction[] = [
  { label: 'shoes', confidence: 0.9 },
  { label: 'bag', confidence: 0.06 },
  { label: 'hat', confidence: 0.03 },
]

describe('decide', () => {
  test('pre-fills an empty field above the threshold', () => {
    expect(decide(p, 0.8, '', null)).toEqual({ prefill: 'Shoes', chips: ['Shoes', 'Bag', 'Hat'], line: 'sure', guess: 'Shoes' })
  })

  test('pre-fills an empty field below the threshold as a best guess', () => {
    expect(decide(p, 0.95, '', null)).toEqual({
      prefill: 'Shoes',
      chips: ['Shoes', 'Bag', 'Hat'],
      line: 'guessFilled',
      guess: 'Shoes',
    })
  })

  test('below the threshold with a saved type is a plain guess', () => {
    expect(decide(p, 0.95, 'Sneakers', null)).toMatchObject({ prefill: null, line: 'guess', guess: 'Shoes' })
  })

  test('sure even when the field is not open', () => {
    expect(decide(p, 0.8, 'Sneakers', null)).toMatchObject({ prefill: null, line: 'sure' })
  })

  test('replaces its own earlier guess below the threshold', () => {
    expect(decide(p, 0.95, 'Hat', 'Hat').prefill).toBe('Shoes')
  })

  test('no predictions: no pre-fill, unsure', () => {
    expect(decide([], 0.5, '', null)).toEqual({ prefill: null, chips: [], line: 'unsure', guess: null })
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
    expect(decide(p, 1, '', null)).toMatchObject({ prefill: null, line: 'unsure' })
  })

  test('a threshold of 1 never pre-fills, even at confidence 1', () => {
    expect(decide([{ label: 'shoes', confidence: 1 }], 1, '', null).prefill).toBeNull()
  })
})

describe('lineText', () => {
  test('sure', () => {
    expect(lineText('sure', 'Shorts')).toBe('Ooh, that looks like Shorts!')
  })

  test('a best guess it filled in', () => {
    expect(lineText('guessFilled', 'Shorts')).toBe("My best guess is Shorts. Tap another if it's not.")
  })

  test('a best guess beside the user\'s own type', () => {
    expect(lineText('guess', 'Shorts')).toBe('My best guess is Shorts.')
  })

  test('unsure', () => {
    expect(lineText('unsure', null)).toBe('Not sure about this one. Which is it?')
  })
})
