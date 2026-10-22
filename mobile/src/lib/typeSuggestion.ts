import type { Prediction } from './suggestion'

export type ClassifyResult = { predictions: Prediction[]; threshold: number }

type Handlers = {
  onPending(pending: boolean): void
  onResult(result: ClassifyResult): void
}

// Runs the classifier for the photo the user chose last. Results and errors for earlier photos
// are ignored, so a slow run cannot overwrite the suggestion for a newer photo.
// Pure on purpose: it takes the classifier as a function so it can be tested without native code.
export function createTypeSuggestion(run: (uri: string) => Promise<ClassifyResult>, handlers: Handlers) {
  let latest = 0

  return {
    start(uri: string) {
      const id = ++latest
      handlers.onPending(true)
      run(uri).then(
        (result) => {
          if (id !== latest) return
          handlers.onPending(false)
          handlers.onResult(result)
        },
        (error: unknown) => {
          if (id !== latest) return
          handlers.onPending(false)
          console.warn('[classify] failed', error)
        },
      )
    },
  }
}
