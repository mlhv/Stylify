import { describe, expect, mock, test } from 'bun:test'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

import pkg from '../../package.json'
import expoPkg from '../../../node_modules/@kinde/expo/package.json'
import { clearLocalTokens, hasStoredRefreshToken } from './kindeSession'

const resolveFrom = (dir: string) => realpathSync(require.resolve('@kinde/js-utils', { paths: [resolve(__dirname, dir)] }))

describe('@kinde/js-utils', () => {
  // Sign-out reads the storage @kinde/expo registered, so both must load the same module instance.
  test('the app and @kinde/expo resolve the same copy', () => {
    expect(resolveFrom('.')).toBe(resolveFrom('../../../node_modules/@kinde/expo/dist'))
  })

  test('mobile declares exactly the version @kinde/expo pins', () => {
    expect(pkg.dependencies['@kinde/js-utils']).toBe(expoPkg.dependencies['@kinde/js-utils'])
  })
})

describe('clearLocalTokens', () => {
  function fake() {
    const removed: string[] = []
    return {
      removed,
      store: {
        removeItems: mock(async (...keys: string[]) => void removed.push(...keys)),
        removeSessionItem: mock(async (key: string) => void removed.push(key)),
      },
    }
  }

  test('removes all three tokens and stops the refresh timer', async () => {
    const { removed, store } = fake()
    const clearTimer = mock(() => {})
    await clearLocalTokens({ active: () => store as never, insecure: () => null, clearTimer })
    expect(removed).toEqual(['accessToken', 'idToken', 'refreshToken'])
    expect(clearTimer).toHaveBeenCalledTimes(1)
  })

  test('also clears a separate insecure store', async () => {
    const a = fake()
    const b = fake()
    await clearLocalTokens({ active: () => a.store as never, insecure: () => b.store as never, clearTimer: () => {} })
    expect(b.removed).toEqual(['refreshToken'])
  })

  test('the timer is stopped even when removal fails', async () => {
    const { store } = fake()
    store.removeItems.mockImplementation(async () => Promise.reject(new Error('keychain')))
    const clearTimer = mock(() => {})
    await expect(clearLocalTokens({ active: () => store as never, insecure: () => null, clearTimer })).rejects.toThrow('keychain')
    expect(clearTimer).toHaveBeenCalledTimes(1)
  })
})

describe('hasStoredRefreshToken', () => {
  const storeWith = (value: unknown) => ({ getSessionItem: mock(async () => value) }) as never

  test('is true when a refresh token is stored', async () => {
    expect(await hasStoredRefreshToken({ active: () => storeWith('r') })).toBe(true)
  })

  test('is false when none is stored, or the value is not a string', async () => {
    expect(await hasStoredRefreshToken({ active: () => storeWith(null) })).toBe(false)
    expect(await hasStoredRefreshToken({ active: () => storeWith('') })).toBe(false)
    expect(await hasStoredRefreshToken({ active: () => storeWith(5) })).toBe(false)
  })

  test('is false when the storage is not ready or cannot be read', async () => {
    expect(await hasStoredRefreshToken({ active: () => null })).toBe(false)
    const broken = { getSessionItem: async () => Promise.reject(new Error('keychain')) } as never
    expect(await hasStoredRefreshToken({ active: () => broken })).toBe(false)
  })
})
