import { auth } from './auth.js'

export type BootstrapUserInput = {
  email: string
  password: string
  name: string
}

/**
 * Always create bootstrap users through Better-Auth.
 * This guarantees password hashing format matches runtime verification.
 */
export async function createBootstrapUser(input: BootstrapUserInput): Promise<string> {
  const result = await auth.api.signUpEmail({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
    },
  })

  const userId = result?.user?.id
  if (!userId) {
    throw new Error('Failed to create bootstrap user — no user returned')
  }

  return userId
}
