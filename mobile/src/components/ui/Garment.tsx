import { type TypeKey } from '@stylify/shared/brand'
import { Image } from 'expo-image'

// White shapes on transparent, recoloured with tintColor.
const SOURCES: Record<TypeKey | 'hanger', number> = {
  top: require('../../../assets/illustrations/top.png'),
  outerwear: require('../../../assets/illustrations/outerwear.png'),
  trousers: require('../../../assets/illustrations/trousers.png'),
  shorts: require('../../../assets/illustrations/shorts.png'),
  skirt: require('../../../assets/illustrations/skirt.png'),
  dress: require('../../../assets/illustrations/dress.png'),
  shoes: require('../../../assets/illustrations/shoes.png'),
  hat: require('../../../assets/illustrations/hat.png'),
  bag: require('../../../assets/illustrations/bag.png'),
  other: require('../../../assets/illustrations/other.png'),
  hanger: require('../../../assets/illustrations/hanger.png'),
}

export function Garment({ kind, size, color }: { kind: TypeKey | 'hanger'; size: number; color: string }) {
  return (
    <Image
      source={SOURCES[kind]}
      tintColor={color}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessible={false}
    />
  )
}
