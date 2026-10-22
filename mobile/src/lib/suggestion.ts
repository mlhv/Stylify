import { DISPLAY_NAMES, type Label } from './classifierConfig'

export type Prediction = { label: Label; confidence: number }

export type Decision = { prefill: string | null; chips: string[] }

const CHIP_COUNT = 3

// Decides what the type field should be pre-filled with, and which suggestion chips to show.
// predictions must already be sorted by confidence, highest first.
// A pre-fill happens only when the top confidence reaches the threshold, and only into a field
// that is empty or still holds the previous pre-fill; a type the user chose or changed is kept.
// A threshold of 1 or more means "never pre-fill".
export function decide(
  predictions: Prediction[],
  threshold: number,
  currentType: string,
  lastPrefill: string | null,
): Decision {
  const chips = predictions.slice(0, CHIP_COUNT).map((p) => DISPLAY_NAMES[p.label])
  const top = predictions[0]
  const fieldIsOpen = currentType.trim() === '' || (lastPrefill !== null && currentType === lastPrefill)
  const shouldPrefill = threshold < 1 && top !== undefined && top.confidence >= threshold && fieldIsOpen

  return { prefill: shouldPrefill ? DISPLAY_NAMES[top.label] : null, chips }
}
