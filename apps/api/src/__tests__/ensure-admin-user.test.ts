import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const selectLimitMock = vi.fn()
const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }))
const selectFromMock = vi.fn(() => ({ where: selectWhereMock }))
const selectMock = vi.fn(() => ({ from: selectFromMock }))

const deleteWhereMock = vi.fn()
const deleteMock = vi.fn(() => ({ where: deleteWhereMock }))

const updateWhereMock = vi.fn()
const updateSetMock = vi.fn(() => ({ where: updateWhereMock }))
const updateMock = vi.fn(() => ({ set: updateSetMock }))

const setRoleMock = vi.fn()
const createBootstrapUserMock = vi.fn()

vi.mock('@voyager/db', () => ({
  db: {
    select: selectMock,
    delete: deleteMock,
    update: updateMock,
  },
  user: {
    id: 'id',
    role: 'role',
    email: 'email',
  },
  account: {
    userId: 'userId',
    providerId: 'providerId',
    password: 'password',
  },
}))

vi.mock('../lib/auth.js', () => ({
  auth: {
    api: {
      setRole: setRoleMock,
    },
  },
}))

vi.mock('../lib/auth-bootstrap.js', () => ({
  createBootstrapUser: createBootstrapUserMock,
}))

describe('ensureAdminUser', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()

    selectMock.mockReturnValue({ from: selectFromMock })
    selectFromMock.mockReturnValue({ where: selectWhereMock })
    selectWhereMock.mockReturnValue({ limit: selectLimitMock })
    deleteMock.mockReturnValue({ where: deleteWhereMock })
    updateMock.mockReturnValue({ set: updateSetMock })
    updateSetMock.mockReturnValue({ where: updateWhereMock })

    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ADMIN_EMAIL', 'admin@voyager.local')
    vi.stubEnv('ADMIN_PASSWORD', 'admin123')
    vi.stubEnv('ADMIN_NAME', 'Voyager Admin')
  })

  it('does not delete when credential account is missing', async () => {
    selectLimitMock.mockResolvedValueOnce([{ id: 'admin-001', role: 'admin' }]).mockResolvedValueOnce([])

    const { ensureAdminUser } = await import('../lib/ensure-admin-user.js')
    await ensureAdminUser()

    expect(deleteMock).not.toHaveBeenCalled()
    expect(createBootstrapUserMock).not.toHaveBeenCalled()
    expect(setRoleMock).not.toHaveBeenCalled()
  })

  it('does not delete when credential account has modern Better-Auth hash', async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 'admin-001', role: 'admin' }])
      .mockResolvedValueOnce([{ providerId: 'credential', password: 'scrypt:ln=14,r=8,p=1$abc$def' }])

    const { ensureAdminUser } = await import('../lib/ensure-admin-user.js')
    await ensureAdminUser()

    expect(deleteMock).not.toHaveBeenCalled()
    expect(createBootstrapUserMock).not.toHaveBeenCalled()
  })

  it('deletes and recreates only when known legacy bcrypt credential is present', async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 'admin-001', role: 'admin' }])
      .mockResolvedValueOnce([{ providerId: 'credential', password: '$2b$10$legacyhashlegacyhashlegacyhashlegacyha' }])
    createBootstrapUserMock.mockResolvedValue('admin-new')

    const { ensureAdminUser } = await import('../lib/ensure-admin-user.js')
    await ensureAdminUser()

    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(createBootstrapUserMock).toHaveBeenCalledWith({
      email: 'admin@voyager.local',
      password: 'admin123',
      name: 'Voyager Admin',
    })
    expect(setRoleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: 'admin-new', role: 'admin' },
      }),
    )
  })

  it('falls back to direct role update when setRole is unauthorized for existing user', async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 'admin-existing', role: 'user' }])
      .mockResolvedValueOnce([{ role: 'admin' }])
    setRoleMock.mockRejectedValueOnce({ statusCode: 401, status: 'UNAUTHORIZED' })

    const { ensureAdminUser } = await import('../lib/ensure-admin-user.js')
    await expect(ensureAdminUser()).resolves.toBeUndefined()

    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateSetMock).toHaveBeenCalledWith({ role: 'admin' })
    expect(updateWhereMock).toHaveBeenCalledTimes(1)
    expect(createBootstrapUserMock).not.toHaveBeenCalled()
  })

  it('falls back and verifies role update for created user when setRole returns nested unauthorized error', async () => {
    selectLimitMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ role: 'admin' }])

    createBootstrapUserMock.mockResolvedValueOnce('admin-created')
    setRoleMock.mockRejectedValueOnce({
      message: 'setRole failed',
      cause: {
        response: {
          status: 401,
          message: 'Unauthorized',
        },
      },
    })

    const { ensureAdminUser } = await import('../lib/ensure-admin-user.js')
    await expect(ensureAdminUser()).resolves.toBeUndefined()

    expect(createBootstrapUserMock).toHaveBeenCalledTimes(1)
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateSetMock).toHaveBeenCalledWith({ role: 'admin' })
    expect(updateWhereMock).toHaveBeenCalledTimes(1)
  })

  it('throws explicit error when fallback role update cannot be verified', async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 'admin-existing', role: 'user' }])
      .mockResolvedValueOnce([{ role: 'user' }])
    setRoleMock.mockRejectedValueOnce({ statusCode: 401 })

    const { ensureAdminUser } = await import('../lib/ensure-admin-user.js')
    await expect(ensureAdminUser()).rejects.toThrow('Bootstrap fallback failed to verify admin role assignment')
  })

  it('still throws when setRole fails with non-authorization error', async () => {
    selectLimitMock.mockResolvedValueOnce([{ id: 'admin-existing', role: 'user' }])
    setRoleMock.mockRejectedValueOnce(new Error('boom'))

    const { ensureAdminUser } = await import('../lib/ensure-admin-user.js')
    await expect(ensureAdminUser()).rejects.toThrow('boom')

    expect(updateMock).not.toHaveBeenCalled()
  })
})
