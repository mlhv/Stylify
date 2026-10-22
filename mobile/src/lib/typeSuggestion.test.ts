import { describe, expect, mock, test } from 'bun:test'

import { decide } from './suggestion'
import { createTypeSuggestion, type ClassifyResult } from './typeSuggestion'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const resultA: ClassifyResult = { predictions: [{ label: 'top', confidence: 0.9 }], threshold: 0.7 }
const resultB: ClassifyResult = { predictions: [{ label: 'shoes', confidence: 0.95 }], threshold: 0.7 }

function setup() {
  const runs: Record<string, ReturnType<typeof deferred<ClassifyResult>>> = {}
  const run = (uri: string) => (runs[uri] = deferred<ClassifyResult>()).promise
  const pendingCalls: boolean[] = []
  const onResult = mock((_result: ClassifyResult) => {})
  const suggestion = createTypeSuggestion(run, { onPending: (p) => pendingCalls.push(p), onResult })
  return { runs, pendingCalls, onResult, suggestion }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createTypeSuggestion', () => {
  test('drops a result for an earlier photo', async () => {
    const { runs, onResult, suggestion } = setup()
    suggestion.start('a')
    suggestion.start('b')
    runs.a!.resolve(resultA)
    runs.b!.resolve(resultB)
    await flush()
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith(resultB)
  })

  test('clears the pending state on failure', async () => {
    const warn = mock(() => {})
    const original = console.warn
    console.warn = warn
    try {
      const { runs, pendingCalls, onResult, suggestion } = setup()
      suggestion.start('a')
      runs.a!.reject(new Error('boom'))
      await flush()
      expect(pendingCalls).toEqual([true, false])
      expect(onResult).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      console.warn = original
    }
  })

  test('a failure for an earlier photo does not clear the pending state of the latest', async () => {
    const warn = mock(() => {})
    const original = console.warn
    console.warn = warn
    try {
      const { runs, pendingCalls, suggestion } = setup()
      suggestion.start('a')
      suggestion.start('b')
      runs.a!.reject(new Error('boom'))
      await flush()
      expect(pendingCalls.at(-1)).toBe(true)
    } finally {
      console.warn = original
    }
  })

  test('uses the field value at completion', async () => {
    let field = ''
    let decision: ReturnType<typeof decide> | undefined
    const runs: Record<string, ReturnType<typeof deferred<ClassifyResult>>> = {}
    const suggestion = createTypeSuggestion((uri) => (runs[uri] = deferred<ClassifyResult>()).promise, {
      onPending: () => {},
      onResult: (result) => {
        decision = decide(result.predictions, result.threshold, field, null)
      },
    })
    suggestion.start('a')
    field = 'Boots'
    runs.a!.resolve(resultB)
    await flush()
    expect(decision?.prefill).toBeNull()
  })
})
