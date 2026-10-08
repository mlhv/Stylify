import { describe, expect, test } from 'bun:test'
import { refreshOutcome } from './refreshOutcome'

describe('refreshOutcome', () => {
  test('success means a new token is stored', () => {
    expect(refreshOutcome({ success: true })).toBe(true)
  })

  test('a network failure throws, so the caller stays signed in', () => {
    expect(() =>
      refreshOutcome({ success: false, error: 'No access token received: TypeError: Network request failed' }),
    ).toThrow()
  })

  test.each([
    'No refresh token found',
    'Failed to refresh token',
    'No access token received',
    'No active storage found',
    'Domain is required for token refresh',
  ])('"%s" means the session is over', (error) => {
    expect(refreshOutcome({ success: false, error })).toBe(false)
  })

  test('a failure without a message means the session is over', () => {
    expect(refreshOutcome({ success: false })).toBe(false)
  })
})
