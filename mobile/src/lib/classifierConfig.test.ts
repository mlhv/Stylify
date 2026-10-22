import { describe, expect, test } from 'bun:test'

import { DISPLAY_NAMES, LABELS, parseConfig } from './classifierConfig'

const valid = {
  labels: [...LABELS],
  inputSize: 224,
  resizeMode: 'stretch',
  normalize: {
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  },
  threshold: 0.5,
}

describe('classifierConfig', () => {
  test('the shipped classifier.json matches the app labels', () => {
    const config = parseConfig(require('../../assets/model/classifier.json'))
    expect(config.labels).toEqual([...LABELS])
  })

  test('rejects labels in another order', () => {
    expect(() => parseConfig({ ...valid, labels: ['outerwear', 'top', ...LABELS.slice(2)] })).toThrow()
  })

  test('converts mean and std to alpha and beta', () => {
    const c = parseConfig({ ...valid, normalize: { mean: [0.5, 0.5, 0.5], std: [0.25, 0.5, 1] } })
    expect(c.normalizeOpts.alpha).toEqual([1 / 63.75, 1 / 127.5, 1 / 255])
    expect(c.normalizeOpts.beta).toEqual([-2, -1, -0.5])
  })

  test('ignores unknown keys', () => {
    const c = parseConfig({ ...valid, model: 'efficientnet_b0', scores: { valBalancedAccuracy: 0.93 } })
    expect(c.threshold).toBe(0.5)
  })

  test('throws for a threshold outside [0, 1]', () => {
    expect(() => parseConfig({ ...valid, threshold: -0.1 })).toThrow()
    expect(() => parseConfig({ ...valid, threshold: 1.1 })).toThrow()
  })

  test('accepts thresholds at the bounds', () => {
    expect(parseConfig({ ...valid, threshold: 0 }).threshold).toBe(0)
    expect(parseConfig({ ...valid, threshold: 1 }).threshold).toBe(1)
  })

  test('throws for a resizeMode other than stretch', () => {
    expect(() => parseConfig({ ...valid, resizeMode: 'letterbox' })).toThrow()
  })

  test('has a display name for every label', () => {
    expect(DISPLAY_NAMES.top).toBe('Top')
    expect(DISPLAY_NAMES.bag).toBe('Bag')
    expect(Object.keys(DISPLAY_NAMES).sort()).toEqual([...LABELS].sort())
  })
})
