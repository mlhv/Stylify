import { describe, expect, test } from 'bun:test'

import { sessionState } from './sessionState'

describe('sessionState', () => {
  test('is pending while the provider starts', () => {
    expect(sessionState({ isLoading: true, isAuthenticated: false, hasStoredToken: null })).toBe('pending')
    expect(sessionState({ isLoading: true, isAuthenticated: true, hasStoredToken: true })).toBe('pending')
  })

  test('is signed in when the provider says so, without reading storage', () => {
    expect(sessionState({ isLoading: false, isAuthenticated: true, hasStoredToken: null })).toBe('signedIn')
  })

  test('waits for the storage check when the provider is not authenticated', () => {
    expect(sessionState({ isLoading: false, isAuthenticated: false, hasStoredToken: null })).toBe('pending')
  })

  test('a stored refresh token keeps the user signed in (offline start)', () => {
    expect(sessionState({ isLoading: false, isAuthenticated: false, hasStoredToken: true })).toBe('signedIn')
  })

  test('no stored token is signed out', () => {
    expect(sessionState({ isLoading: false, isAuthenticated: false, hasStoredToken: false })).toBe('signedOut')
  })
})
