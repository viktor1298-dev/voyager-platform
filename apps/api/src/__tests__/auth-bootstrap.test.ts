import { beforeEach, describe, expect, it, vi } from 'vitest'

const signUpEmailMock = vi.fn()

vi.mock('../lib/auth.js', () => ({
  auth: {
    api: {
      signUpEmail: signUpEmailMock,
    },
  },
}))

describe('createBootstrapUser', () => {
  beforeEach(() => {
    signUpEmailMock.mockReset()
  })

  it('creates user via Better-Auth signUpEmail and returns user id', async () => {
    signUpEmailMock.mockResolvedValue({ user: { id: 'user_123' } })

    const { createBootstrapUser } = await import('../lib/auth-bootstrap.js')

    const userId = await createBootstrapUser({
      email: 'admin@voyager.local',
      password: 'admin123',
      name: 'Voyager Admin',
    })

    expect(userId).toBe('user_123')
    expect(signUpEmailMock).toHaveBeenCalledWith({
      body: {
        email: 'admin@voyager.local',
        password: 'admin123',
        name: 'Voyager Admin',
      },
    })
  })

  it('throws when Better-Auth returns no user id', async () => {
    signUpEmailMock.mockResolvedValue({ user: null })

    const { createBootstrapUser } = await import('../lib/auth-bootstrap.js')

    await expect(
      createBootstrapUser({
        email: 'admin@voyager.local',
        password: 'admin123',
        name: 'Voyager Admin',
      }),
    ).rejects.toThrow('Failed to create bootstrap user — no user returned')
  })
})
