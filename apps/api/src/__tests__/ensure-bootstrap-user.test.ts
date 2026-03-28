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

describe('ensureBootstrapUser', () => {
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
  })

  it('recreates viewer when legacy seeded row exists without credential account', async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 'viewer-001', role: 'viewer' }])
      .mockResolvedValueOnce([])
    createBootstrapUserMock.mockResolvedValueOnce('viewer-recreated')

    const { ensureBootstrapUser } = await import('../lib/ensure-bootstrap-user.js')
    const userId = await ensureBootstrapUser({
      email: 'viewer@voyager.local',
      password: 'viewer123',
      name: 'Viewer User',
      desiredRole: 'viewer',
      legacyUserId: 'viewer-001',
    })

    expect(userId).toBe('viewer-recreated')
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(createBootstrapUserMock).toHaveBeenCalledWith({
      email: 'viewer@voyager.local',
      password: 'viewer123',
      name: 'Viewer User',
    })
    expect(setRoleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: 'viewer-recreated', role: 'user' },
      }),
    )
  })

  it('keeps existing viewer when credential account already exists and role matches', async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 'viewer-existing', role: 'viewer' }])
      .mockResolvedValueOnce([
        { providerId: 'credential', password: 'scrypt:ln=14,r=8,p=1$abc$def' },
      ])

    const { ensureBootstrapUser } = await import('../lib/ensure-bootstrap-user.js')
    const userId = await ensureBootstrapUser({
      email: 'viewer@voyager.local',
      password: 'viewer123',
      name: 'Viewer User',
      desiredRole: 'viewer',
      legacyUserId: 'viewer-001',
    })

    expect(userId).toBe('viewer-existing')
    expect(deleteMock).not.toHaveBeenCalled()
    expect(createBootstrapUserMock).not.toHaveBeenCalled()
    expect(setRoleMock).not.toHaveBeenCalled()
  })

  it('maps viewer role to Better-Auth user role when fixing an existing wrong role', async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 'viewer-existing', role: 'admin' }])
      .mockResolvedValueOnce([
        { providerId: 'credential', password: 'scrypt:ln=14,r=8,p=1$abc$def' },
      ])
    setRoleMock.mockResolvedValueOnce({})

    const { ensureBootstrapUser } = await import('../lib/ensure-bootstrap-user.js')
    await ensureBootstrapUser({
      email: 'viewer@voyager.local',
      password: 'viewer123',
      name: 'Viewer User',
      desiredRole: 'viewer',
      legacyUserId: 'viewer-001',
    })

    expect(setRoleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: 'viewer-existing', role: 'user' },
      }),
    )
  })

  it('falls back to direct viewer role update when setRole is unauthorized', async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 'viewer-existing', role: 'admin' }])
      .mockResolvedValueOnce([
        { providerId: 'credential', password: 'scrypt:ln=14,r=8,p=1$abc$def' },
      ])
      .mockResolvedValueOnce([{ role: 'viewer' }])
    setRoleMock.mockRejectedValueOnce({ statusCode: 401 })

    const { ensureBootstrapUser } = await import('../lib/ensure-bootstrap-user.js')
    await expect(
      ensureBootstrapUser({
        email: 'viewer@voyager.local',
        password: 'viewer123',
        name: 'Viewer User',
        desiredRole: 'viewer',
        legacyUserId: 'viewer-001',
      }),
    ).resolves.toBe('viewer-existing')

    expect(updateSetMock).toHaveBeenCalledWith({ role: 'viewer' })
  })
})
