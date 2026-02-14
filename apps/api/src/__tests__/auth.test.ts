import { describe, it, expect } from 'vitest'
import { signToken, verifyToken, extractBearerToken, type UserPayload } from '../lib/auth'

const testUser: UserPayload = { id: 'user-1', email: 'test@test.com', role: 'admin' }

describe('signToken', () => {
  it('returns a string', () => {
    const token = signToken(testUser)
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)
  })
})

describe('verifyToken', () => {
  it('returns payload for valid token', () => {
    const token = signToken(testUser)
    const payload = verifyToken(token)
    expect(payload).not.toBeNull()
    expect(payload!.id).toBe(testUser.id)
    expect(payload!.email).toBe(testUser.email)
    expect(payload!.role).toBe(testUser.role)
  })

  it('returns null for invalid token', () => {
    expect(verifyToken('invalid.token.here')).toBeNull()
  })

  it('returns null for tampered token', () => {
    const token = signToken(testUser)
    const tampered = token.slice(0, -5) + 'XXXXX'
    expect(verifyToken(tampered)).toBeNull()
  })
})

describe('extractBearerToken', () => {
  it('extracts token from valid Bearer header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123')
  })

  it('returns null for undefined header', () => {
    expect(extractBearerToken(undefined)).toBeNull()
  })

  it('returns null for missing Bearer prefix', () => {
    expect(extractBearerToken('abc123')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractBearerToken('')).toBeNull()
  })
})
