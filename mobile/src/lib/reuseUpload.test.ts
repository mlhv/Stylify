import { describe, expect, mock, test } from 'bun:test'
import { uploadUnlessDone } from './reuseUpload'

describe('uploadUnlessDone', () => {
  test('uploads a photo that has not been uploaded', async () => {
    const upload = mock(async (uri: string) => `https://s3/${uri}`)
    expect(await uploadUnlessDone(null, 'a.jpg', upload)).toEqual({ uri: 'a.jpg', url: 'https://s3/a.jpg' })
    expect(upload).toHaveBeenCalledTimes(1)
  })

  test('reuses the earlier upload of the same photo', async () => {
    const upload = mock(async (uri: string) => `https://s3/${uri}`)
    const previous = { uri: 'a.jpg', url: 'https://s3/first' }
    expect(await uploadUnlessDone(previous, 'a.jpg', upload)).toBe(previous)
    expect(upload).not.toHaveBeenCalled()
  })

  test('uploads again when a different photo was picked', async () => {
    const upload = mock(async (uri: string) => `https://s3/${uri}`)
    const result = await uploadUnlessDone({ uri: 'a.jpg', url: 'https://s3/first' }, 'b.jpg', upload)
    expect(result).toEqual({ uri: 'b.jpg', url: 'https://s3/b.jpg' })
    expect(upload).toHaveBeenCalledTimes(1)
  })
})
