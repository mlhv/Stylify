import { describe, expect, mock, test } from 'bun:test'

import { endSession, type SessionEnd } from './endSession'

function deps(overrides: Partial<SessionEnd> = {}) {
  const calls: string[] = []
  const base: SessionEnd = {
    readRefreshToken: mock(async () => 'refresh-1'),
    clearLocal: mock(async () => {
      calls.push('clear')
    }),
    resetProvider: mock(() => {
      calls.push('reset')
    }),
    revoke: mock(async () => {
      calls.push('revoke')
    }),
  }
  return { calls, deps: { ...base, ...overrides } }
}

describe('endSession', () => {
  test('clears the stored tokens, resets the provider, and revokes the refresh token', async () => {
    const { calls, deps: d } = deps()
    await endSession(d)
    expect(d.revoke).toHaveBeenCalledWith('refresh-1')
    // Local sign-out is finished before the revoke is sent.
    expect(calls.slice(0, 2)).toEqual(['clear', 'reset'])
    expect(calls).toContain('revoke')
  })

  test('a failed revoke does not fail the sign-out', async () => {
    const { calls, deps: d } = deps({ revoke: mock(async () => Promise.reject(new Error('offline'))) })
    await endSession(d)
    expect(calls).toEqual(['clear', 'reset'])
  })

  test('a revoke that never answers does not block the sign-out', async () => {
    const { deps: d } = deps({ revoke: mock(() => new Promise<void>(() => {})) })
    await endSession(d)
    expect(d.resetProvider).toHaveBeenCalledTimes(1)
  })

  test('no stored refresh token: signs out locally and sends no revoke', async () => {
    const { deps: d } = deps({ readRefreshToken: mock(async () => null) })
    await endSession(d)
    expect(d.revoke).not.toHaveBeenCalled()
    expect(d.resetProvider).toHaveBeenCalledTimes(1)
  })

  test('an unreadable refresh token still signs out locally', async () => {
    const { deps: d } = deps({ readRefreshToken: mock(async () => Promise.reject(new Error('locked'))) })
    await endSession(d)
    expect(d.revoke).not.toHaveBeenCalled()
    expect(d.clearLocal).toHaveBeenCalledTimes(1)
    expect(d.resetProvider).toHaveBeenCalledTimes(1)
  })

  test('if the tokens cannot be removed, the provider is not reset and the error surfaces', async () => {
    const { deps: d } = deps({ clearLocal: mock(async () => Promise.reject(new Error('keychain'))) })
    await expect(endSession(d)).rejects.toThrow('keychain')
    expect(d.resetProvider).not.toHaveBeenCalled()
    expect(d.revoke).not.toHaveBeenCalled()
  })
})
