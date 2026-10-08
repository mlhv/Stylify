// A photo that reached S3, kept so a retry after a failed save does not upload it again.
export type UploadedPhoto = { uri: string; url: string }

// Returns the earlier upload when it is for this photo; otherwise uploads the photo.
export async function uploadUnlessDone(
  previous: UploadedPhoto | null,
  photoUri: string,
  upload: (uri: string) => Promise<string>,
): Promise<UploadedPhoto> {
  if (previous?.uri === photoUri) return previous
  return { uri: photoUri, url: await upload(photoUri) }
}
