import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'

export function getAuthBaseUrl() {
  return process.env.NEXT_PUBLIC_AUTH_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9000')
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(),
  plugins: [adminClient()],
})
