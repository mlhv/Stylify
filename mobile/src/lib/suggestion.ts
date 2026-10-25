import { DISPLAY_NAMES, type Label } from './classifierConfig'

export type Prediction = { label: Label; confidence: number }

// What the line under the Type field says: sure of the guess, a best guess it filled in, a best guess beside
// the user's own type, or no guess at all (the placeholder model).
export type LineKind = 'sure' | 'guessFilled' | 'guess' | 'unsure'

export type Decision = { prefill: string | null; chips: string[]; line: LineKind; guess: string | null }

const CHIP_COUNT = 3

// Decides what the type field should be pre-filled with, which suggestion chips to show, and what the line says.
// predictions must already be sorted by confidence, highest first.
// The top guess is always pre-filled, sure or not, but only into a field that is empty or still holds the
// previous pre-fill; a type the user chose or changed is kept. The threshold only decides whether it is "sure".
// A threshold of 1 or more means "never pre-fill".
export function decide(
  predictions: Prediction[],
  threshold: number,
  currentType: string,
  lastPrefill: string | null,
): Decision {
  const chips = predictions.slice(0, CHIP_COUNT).map((p) => DISPLAY_NAMES[p.label])
  const top = predictions[0]
  if (threshold >= 1 || top === undefined) return { prefill: null, chips, line: 'unsure', guess: null }

  const guess = DISPLAY_NAMES[top.label]
  const fieldIsOpen = currentType.trim() === '' || (lastPrefill !== null && currentType === lastPrefill)
  const prefill = fieldIsOpen ? guess : null
  const line: LineKind = top.confidence >= threshold ? 'sure' : prefill ? 'guessFilled' : 'guess'
  return { prefill, chips, line, guess }
}

export function lineText(line: LineKind, guess: string | null): string {
  switch (line) {
    case 'sure':
      return `Ooh, that looks like ${guess}!`
    case 'guessFilled':
      return `My best guess is ${guess}. Tap another if it's not.`
    case 'guess':
      return `My best guess is ${guess}.`
    case 'unsure':
      return 'Not sure about this one. Which is it?'
  }
}
