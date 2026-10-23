import { createRequire } from 'node:module'
import defaultTheme from 'tailwindcss/defaultTheme'
import animate from 'tailwindcss-animate'

// One source for the palette, shared with the iPhone app.
const require = createRequire(import.meta.url)
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
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', ...defaultTheme.fontFamily.sans],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        // shadcn names, still used by the ui/ components
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // brand
        ...brandColors,
        muted: { DEFAULT: tokens.colors.muted, foreground: tokens.colors.muted },
        ...typeColors,
      },
    },
  },
  plugins: [animate],
}
