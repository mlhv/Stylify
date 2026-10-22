export const LABELS = ['top', 'outerwear', 'trousers', 'shorts', 'skirt', 'dress', 'shoes', 'hat', 'bag'] as const

export type Label = (typeof LABELS)[number]

export const DISPLAY_NAMES: Record<Label, string> = {
  top: 'Top',
  outerwear: 'Outerwear',
  trousers: 'Trousers',
  shorts: 'Shorts',
  skirt: 'Skirt',
  dress: 'Dress',
  shoes: 'Shoes',
  hat: 'Hat',
  bag: 'Bag',
}

export type ClassifierConfig = {
  labels: Label[]
  threshold: number
  inputSize: number
  resizeMode: 'stretch'
  normalizeOpts: { alpha: number[]; beta: number[] }
}

function isNumberTriple(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')
}

// Parses the exported classifier.json. Unknown keys are ignored.
// Normalisation is folded into alpha/beta so that pixel * alpha + beta = (pixel / 255 - mean) / std.
export function parseConfig(json: unknown): ClassifierConfig {
  if (typeof json !== 'object' || json === null) throw new Error('classifier config is not an object')
  const raw = json as Record<string, unknown>

  const labels = raw.labels
  if (!Array.isArray(labels) || labels.length !== LABELS.length || labels.some((l, i) => l !== LABELS[i])) {
    throw new Error('classifier labels do not match the app labels, in order')
  }

  if (raw.resizeMode !== 'stretch') throw new Error(`unsupported resizeMode: ${String(raw.resizeMode)}`)

  const threshold = raw.threshold
  if (typeof threshold !== 'number' || !(threshold >= 0 && threshold <= 1)) {
    throw new Error(`threshold must be in [0, 1], got ${String(threshold)}`)
  }

  if (typeof raw.inputSize !== 'number') throw new Error('inputSize must be a number')

  const normalize = raw.normalize as { mean?: unknown; std?: unknown } | undefined
  if (!normalize || !isNumberTriple(normalize.mean) || !isNumberTriple(normalize.std)) {
    throw new Error('normalize.mean and normalize.std must each be three numbers')
  }
  const { mean, std } = normalize

  return {
    labels: [...LABELS],
    threshold,
    inputSize: raw.inputSize,
    resizeMode: 'stretch',
    normalizeOpts: {
      alpha: std.map((s) => 1 / (s * 255)),
      beta: mean.map((m, i) => -m / std[i]!),
    },
  }
}
