import * as ImagePicker from 'expo-image-picker'
import { Alert, Linking } from 'react-native'

import { toJpeg } from './upload'

export type PhotoSource = 'camera' | 'library'

function explainDenied(source: PhotoSource) {
  const what = source === 'camera' ? 'the camera' : 'your photos'
  Alert.alert(
    'Permission needed',
    `Stylify needs access to ${what} to add a picture. You can allow it in Settings.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ],
  )
}

// Returns the URI of a local JPEG, or null if the user cancelled or refused.
export async function pickPhoto(source: PhotoSource): Promise<string | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) {
    explainDenied(source)
    return null
  }

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options)
  if (result.canceled) return null

  const asset = result.assets[0]
  return toJpeg(asset.uri, asset.width)
}
