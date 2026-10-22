import { Asset } from 'expo-asset'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import jpeg from 'jpeg-js'
import { createClassifier, type Classifier } from 'react-native-executorch'

import { parseConfig, type ClassifierConfig, type Label } from './classifierConfig'
import type { ClassifyResult } from './typeSuggestion'

type Loaded = { classifier: Classifier<Label>; config: ClassifierConfig }

let loading: Promise<Loaded> | null = null

async function load(): Promise<Loaded> {
  const config = parseConfig(require('../../assets/model/classifier.json'))
  const asset = await Asset.loadAsync(require('../../assets/model/classifier.pte'))
  const uri = asset[0]?.localUri
  if (!uri) throw new Error('classifier model has no local file')
  const classifier = await createClassifier<Label>({
    modelPath: uri.replace(/^file:\/\//, ''),
    modelOpts: {
      labels: config.labels,
      resizeMode: 'stretch',
      interpolation: 'linear',
      normalizeOpts: config.normalizeOpts,
    },
  })
  return { classifier, config }
}

function getClassifier(): Promise<Loaded> {
  if (!loading) {
    loading = load().catch((e) => {
      // Clear the promise so the next photo retries.
      loading = null
      throw e
    })
  }
  return loading
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Returns the top three labels for a local photo, with the confidence threshold for pre-filling.
export async function classifyPhoto(uri: string): Promise<ClassifyResult> {
  const started = Date.now()
  const { classifier, config } = await getClassifier()

  const context = ImageManipulator.manipulate(uri).resize({ width: config.inputSize, height: config.inputSize })
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true })
  if (!saved.base64) throw new Error('could not read the resized photo')

  const decoded = jpeg.decode(base64ToBytes(saved.base64), { useTArray: true, formatAsRGBA: true })
  const predictions = await classifier.classify(
    { data: decoded.data, width: decoded.width, height: decoded.height, format: 'rgba', layout: 'hwc' },
    { topk: 3 },
  )

  console.log('[classify]', Date.now() - started)
  return { predictions: [...predictions], threshold: config.threshold }
}
