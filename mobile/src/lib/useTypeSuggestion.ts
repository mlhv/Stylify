import { useEffect, useRef, useState } from 'react'

import { classifyPhoto } from './classify'
import { createTypeSuggestion, type ClassifyResult } from './typeSuggestion'

export function useTypeSuggestion(onResult: (result: ClassifyResult) => void) {
  const [pending, setPending] = useState(false)
  const latestOnResult = useRef(onResult)
  latestOnResult.current = onResult

  const suggestion = useRef<ReturnType<typeof createTypeSuggestion> | null>(null)
  if (suggestion.current === null) {
    suggestion.current = createTypeSuggestion(classifyPhoto, {
      onPending: setPending,
      onResult: (result) => latestOnResult.current(result),
    })
  }

  // start() does nothing after unmount. A run already in flight still finishes and may set state;
  // React ignores that on an unmounted component.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return {
    pending,
    start: (uri: string) => {
      if (mounted.current) suggestion.current!.start(uri)
    },
  }
}
