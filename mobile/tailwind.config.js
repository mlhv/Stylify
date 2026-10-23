// One source for the palette, shared with the web app (frontend/tailwind.config.js uses the same names).
const tokens = require('../shared/src/brand/tokens.json')

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

const brandColors = Object.fromEntries(
  Object.entries(tokens.colors).map(([name, hex]) => [kebab(name), hex]),
)
const typeColors = {}
for (const [key, { bg, fg }] of Object.entries(tokens.typeColors)) {
  typeColors[`type-${key}`] = bg
  typeColors[`type-${key}-fg`] = fg
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: { ...brandColors, ...typeColors },
      // Loaded in src/app/_layout.tsx. Use these through <Txt>, never with font-bold and friends:
      // iOS picks the weight from the font file, not from fontWeight.
      fontFamily: {
        nunito: ['Nunito_700Bold'],
        'nunito-heavy': ['Nunito_800ExtraBold'],
        'nunito-black': ['Nunito_900Black'],
      },
    },
  },
  plugins: [],
}
