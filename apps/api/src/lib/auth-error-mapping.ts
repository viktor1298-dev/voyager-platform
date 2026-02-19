const INVALID_PASSWORD_HASH_PATTERN = /invalid password hash/i

function getErrorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return ''
  }
}

export function isSignInEmailPath(path: string): boolean {
  return /\/api\/auth\/sign-in\/email(?:$|\?|\/)/i.test(path)
}

export function isInvalidPasswordHashError(error: unknown): boolean {
  const text = getErrorText(error)
  return INVALID_PASSWORD_HASH_PATTERN.test(text)
}

export function mapAuthRouteErrorToStatus(path: string, error: unknown): number {
  if (isSignInEmailPath(path) && isInvalidPasswordHashError(error)) {
    return 401
  }

  return 500
}

export function mapAuthRouteErrorToBody(path: string, error: unknown): { error: string; code: string } {
  if (isSignInEmailPath(path) && isInvalidPasswordHashError(error)) {
    return {
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
    }
  }

  return {
    error: 'Internal authentication error',
    code: 'AUTH_FAILURE',
  }
}
