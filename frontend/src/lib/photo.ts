// iPhone photos are often HEIC, which Chrome cannot display (in the preview or
// later from S3), so they are converted to JPEG before preview and upload.

const HEIC_TYPES = ['image/heic', 'image/heif']
const HEIC_NAME = /\.hei[cf]$/i

export function isHeicFile(file: File): boolean {
  return HEIC_TYPES.includes(file.type) || HEIC_NAME.test(file.name)
}

type ToJpeg = (heic: Blob) => Promise<Blob>

// heic-to is large, so it is only downloaded when a HEIC photo is picked.
const heicToJpeg: ToJpeg = async (heic) => {
  const { heicTo } = await import('heic-to')
  return heicTo({ blob: heic, type: 'image/jpeg', quality: 0.9 })
}

// Returns a file the browser can show and upload, or undefined if it is not an image.
export async function prepareImage(file: File, toJpeg: ToJpeg = heicToJpeg): Promise<File | undefined> {
  if (isHeicFile(file)) {
    const jpeg = await toJpeg(file)
    return new File([jpeg], file.name.replace(HEIC_NAME, '') + '.jpg', { type: 'image/jpeg' })
  }
  return file.type.startsWith('image/') ? file : undefined
}
