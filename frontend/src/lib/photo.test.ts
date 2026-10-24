import { describe, expect, test } from 'bun:test'
import { isHeicFile, prepareImage } from './photo'

const file = (name: string, type: string) => new File(['x'], name, { type })

describe('isHeicFile', () => {
  test('by MIME type', () => {
    expect(isHeicFile(file('a.bin', 'image/heic'))).toBe(true)
    expect(isHeicFile(file('a.bin', 'image/heif'))).toBe(true)
  })
  test('by extension when the browser gives no type', () => {
    expect(isHeicFile(file('IMG_0001.HEIC', ''))).toBe(true)
    expect(isHeicFile(file('photo.heif', ''))).toBe(true)
  })
  test('other images are not HEIC', () => {
    expect(isHeicFile(file('a.jpg', 'image/jpeg'))).toBe(false)
    expect(isHeicFile(file('a.png', 'image/png'))).toBe(false)
  })
})

describe('prepareImage', () => {
  const toJpeg = async () => new Blob(['jpeg'], { type: 'image/jpeg' })

  test('passes other images through unchanged', async () => {
    const jpg = file('a.jpg', 'image/jpeg')
    expect(await prepareImage(jpg, toJpeg)).toBe(jpg)
  })

  test('converts HEIC to a JPEG file with a .jpg name', async () => {
    const out = await prepareImage(file('IMG_0001.HEIC', 'image/heic'), toJpeg)
    expect(out?.type).toBe('image/jpeg')
    expect(out?.name).toBe('IMG_0001.jpg')
  })

  test('rejects files that are not images', async () => {
    expect(await prepareImage(file('notes.txt', 'text/plain'), toJpeg)).toBeUndefined()
  })
})
