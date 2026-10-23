import { Text, type TextProps } from 'react-native'

const FONT = { bold: 'font-nunito', heavy: 'font-nunito-heavy', black: 'font-nunito-black' } as const

// A text colour class from the theme, or an arbitrary one. NativeWind does not let a later class
// win over an earlier one, so the default ink is only added when the caller sets no colour.
const COLOUR_CLASS = /(^|\s)text-(cream|ink|muted|line|coral|coral-dark|sun|white|danger|danger-dark|type-[\w-]+|\[#)/

/** Every text in the app goes through this, so Nunito is never missed. */
export function Txt({
  weight = 'bold',
  className = '',
  ...props
}: TextProps & { weight?: keyof typeof FONT; className?: string }) {
  const colour = COLOUR_CLASS.test(className) ? '' : 'text-ink'
  return <Text className={`${FONT[weight]} ${colour} ${className}`} {...props} />
}
