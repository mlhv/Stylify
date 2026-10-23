import tokens from './tokens.json'

export const TYPE_LABELS = [
  'top', 'outerwear', 'trousers', 'shorts', 'skirt', 'dress', 'shoes', 'hat', 'bag',
] as const
export type TypeLabel = (typeof TYPE_LABELS)[number]
export type TypeKey = TypeLabel | 'other'
export type Filter = 'all' | TypeKey

export const colors: {
  cream: string; ink: string; muted: string; line: string; coral: string
  coralDark: string; sun: string; white: string; danger: string; dangerDark: string
} = tokens.colors

export const typeColors: Record<TypeKey, { bg: string; fg: string }> = tokens.typeColors

export const TYPE_NAMES: Record<TypeKey, string> = {
  top: 'Top', outerwear: 'Outerwear', trousers: 'Trousers', shorts: 'Shorts', skirt: 'Skirt',
  dress: 'Dress', shoes: 'Shoes', hat: 'Hat', bag: 'Bag', other: 'Other',
}

const SYNONYMS: Record<TypeLabel, string[]> = {
  top: ['t-shirt', 'tshirt', 'tee', 'shirt', 'blouse', 'sweater', 'jumper', 'polo', 'tank top'],
  outerwear: ['jacket', 'coat', 'hoodie', 'parka', 'blazer', 'cardigan', 'fleece'],
  trousers: ['pants', 'jeans', 'chinos', 'joggers', 'leggings'],
  shorts: [],
  skirt: [],
  dress: [],
  shoes: ['shoe', 'sneakers', 'trainers', 'boots', 'sandals', 'heels'],
  hat: ['beanie', 'cap'],
  bag: ['backpack', 'tote', 'handbag'],
}

const LOOKUP = new Map<string, TypeLabel>()
for (const label of TYPE_LABELS) {
  for (const word of [label, ...SYNONYMS[label]]) {
    for (const form of [word, `${word}s`, `${word}es`]) LOOKUP.set(form, label)
  }
}

export function typeKey(type: string | null | undefined): TypeKey {
  return LOOKUP.get((type ?? '').trim().toLowerCase()) ?? 'other'
}

export function groupByType<T extends { type: string | null }>(
  items: T[],
): { key: TypeKey; count: number }[] {
  const counts = new Map<TypeKey, number>()
  for (const item of items) {
    const key = typeKey(item.type)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return ([...TYPE_LABELS, 'other'] as TypeKey[])
    .filter((key) => counts.has(key))
    .map((key) => ({ key, count: counts.get(key)! }))
}

export function resolveFilter(filter: Filter, groups: { key: TypeKey }[]): Filter {
  return filter === 'all' || groups.some((g) => g.key === filter) ? filter : 'all'
}

export function filterItems<T extends { type: string | null }>(items: T[], filter: Filter): T[] {
  return filter === 'all' ? items : items.filter((item) => typeKey(item.type) === filter)
}
export { GARMENT_PATHS } from './garments'
