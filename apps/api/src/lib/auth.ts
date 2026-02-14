import jwt from 'jsonwebtoken'

export interface UserPayload {
  id: string
  email: string
  role: 'admin' | 'viewer'
}

const JWT_SECRET = process.env.JWT_SECRET ?? (() => { throw new Error('JWT_SECRET environment variable is required') })()
const TOKEN_EXPIRY = '24h'

export function signToken(payload: UserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY })
}

export function verifyToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload
  } catch {
    return null
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}
