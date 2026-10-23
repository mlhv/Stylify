import type { TypeKey } from './index'

// Flat, single-colour garment silhouettes. Each entry is a list of SVG path `d`
// strings on a 64×64 viewBox; draw every path with the same fill and
// `fill-rule="evenodd"` (the zip in `outerwear` and the hole in `other` are cut out).
export const GARMENT_PATHS: Record<TypeKey | 'hanger', string[]> = {
  top: [
    'M22 8l-12 6-6 14 9 4 3-6v32h32V26l3 6 9-4-6-14-12-6c-2 5-6 8-10 8s-8-3-10-8z',
  ],
  outerwear: [
    'M24 6c-4 2-6 6-6 10l-10 6-4 24 8 2 4-16v30h32V32l4 16 8-2-4-24-10-6c0-4-2-8-6-10-2 4-5 6-8 6s-6-2-8-6z M31 19h2v43h-2z',
  ],
  trousers: ['M16 6h32l4 52h-14l-6-34-6 34H12z'],
  shorts: ['M10 14h44l4 32H37l-5-14-5 14H6z'],
  skirt: [
    'M21 10h22v6H21z',
    'M20 19h24l11 33c-7 3-15 4-23 4s-16-1-23-4z',
  ],
  dress: [
    'M22 6h4v8c1 3 3 4 6 4s5-1 6-4V6h4v10l-3 10 14 30H11l14-30-3-10z',
  ],
  shoes: [
    'M6 48V22h14c2 6 8 10 16 12l18 4c4 1 6 4 6 8v2z',
    'M6 51h54v4a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z',
  ],
  hat: [
    'M12 38c0-15 9-26 20-26s20 11 20 26z',
    'M12 41h40a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z',
    'M32 3a5 5 0 1 0 0 10a5 5 0 1 0 0-10z',
  ],
  bag: [
    'M10 26h44l-4 30H14z',
    'M21 26v-6a11 11 0 0 1 22 0v6h-5v-6a6 6 0 0 0-12 0v6z',
  ],
  other: [
    'M32 6l16 16v30a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V22z M32 17a5 5 0 1 0 0 10a5 5 0 1 0 0-10z',
  ],
  hanger: [
    'M32 10a7 7 0 0 0-7 7h5a2 2 0 1 1 3.2 1.6L30 21v6L6 44a3 3 0 0 0 2 5h48a3 3 0 0 0 2-5L35 27v-3.6A7 7 0 0 0 32 10z',
  ],
}
