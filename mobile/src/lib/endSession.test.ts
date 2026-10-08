import { describe, expect, mock, test } from 'bun:test'

import { endSession } from './endSession'

describe('endSession', () => {
  test('logs out in an isolated browser session so iOS shows no sign-in prompt', async () => {
    const logout = mock(async () => ({ success: true }))
    await endSession(logout, { revokeToken: true })
    expect(logout).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith({ revokeToken: true }, { preferEphemeralSession: true })
  })

  test('passes revokeToken through', async () => {
    const logout = mock(async () => ({ success: true }))
    await endSession(logout, { revokeToken: false })
    expect(logout).toHaveBeenCalledWith({ revokeToken: false }, { preferEphemeralSession: true })
  })
})
