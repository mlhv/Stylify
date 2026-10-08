import { fetch } from 'expo/fetch'
import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

import { getSignedURL } from './api'

const MAX_WIDTH = 1600

// iPhone photos are often HEIC and several megabytes; the server names every
// object .jpg, so always re-encode. Resizing only ever shrinks.
export async function toJpeg(uri: string, width: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri)
  if (width > MAX_WIDTH) context.resize({ width: MAX_WIDTH })
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })
  return saved.uri
}

// Uploads a local JPEG straight to S3 and returns its public URL.
export async function uploadImage(jpegUri: string): Promise<string> {
  const data = await getSignedURL()
  if (!data.success) throw new Error('Could not start the upload')
  // SDK 55's File has no upload(); it implements Blob, so expo/fetch reads its
  // bytes natively and sends them as the PUT body.
  const res = await fetch(data.signedURL, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    // Runtime-compatible with Blob; only React Native's Blob typings differ.
    body: new File(jpegUri) as unknown as Blob,
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error('Could not upload the photo')
  }
  return data.signedURL.split('?')[0]
}
