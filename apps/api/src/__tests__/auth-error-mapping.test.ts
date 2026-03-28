import { describe, expect, it } from 'vitest'
import {
  isInvalidPasswordHashError,
  isSignInEmailPath,
  mapAuthRouteErrorToBody,
  mapAuthRouteErrorToStatus,
} from '../lib/auth-error-mapping.js'

describe('auth-error-mapping', () => {
  it('detects sign-in email path variants', () => {
    expect(isSignInEmailPath('/api/auth/sign-in/email')).toBe(true)
    expect(isSignInEmailPath('/api/auth/sign-in/email?callback=/')).toBe(true)
    expect(isSignInEmailPath('/api/auth/sign-in/email/')).toBe(true)
    expect(isSignInEmailPath('/api/auth/sign-up/email')).toBe(false)
  })

  it('detects invalid hash errors from Error/string/object payloads', () => {
    expect(isInvalidPasswordHashError(new Error('Invalid password hash'))).toBe(true)
    expect(isInvalidPasswordHashError('invalid password hash')).toBe(true)
    expect(isInvalidPasswordHashError({ message: 'Invalid password hash format' })).toBe(true)
    expect(isInvalidPasswordHashError(new Error('DB timeout'))).toBe(false)
  })

  it('maps invalid password hash on sign-in to 401', () => {
    const status = mapAuthRouteErrorToStatus(
      '/api/auth/sign-in/email',
      new Error('Invalid password hash'),
    )
    const body = mapAuthRouteErrorToBody(
      '/api/auth/sign-in/email',
      new Error('Invalid password hash'),
    )

    expect(status).toBe(401)
    expect(body).toEqual({
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
    })
  })

  it('keeps other auth errors as 500', () => {
    const status = mapAuthRouteErrorToStatus(
      '/api/auth/sign-up/email',
      new Error('Invalid password hash'),
    )
    const body = mapAuthRouteErrorToBody('/api/auth/get-session', new Error('something else'))

    expect(status).toBe(500)
    expect(body).toEqual({
      error: 'Internal authentication error',
      code: 'AUTH_FAILURE',
    })
  })
})
