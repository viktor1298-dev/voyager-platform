import { beforeEach, describe, expect, it, vi } from 'vitest'

const selectLimitMock = vi.fn()
const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }))
const selectFromMock = vi.fn(() => ({ where: selectWhereMock }))
const selectMock = vi.fn(() => ({ from: selectFromMock }))

const deleteWhereMock = vi.fn()
const deleteMock = vi.fn(() => ({ where: deleteWhereMock }))

const signUpEmailMock = vi.fn()
const setRoleMock = vi.fn()
const createBootstrapUserMock = vi.fn()

vi.mock('@voyager/db', () => ({
  db: {
    select: selectMock,
    delete: deleteMock,
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
      signUpEmail: signUpEmailMock,
      setRole: setRoleMock,
    },
  },
}))

vi.mock('../lib/auth-bootstrap.js', () => ({
  createBootstrapUser: createBootstrapUserMock,
}))

describe('ensureAdminUser', () => {
  beforeEach(() => {
    vi.resetModules()
    selectMock.mockReset()
    selectFromMock.mockReset()
    selectWhereMock.mockReset()
    selectLimitMock.mockReset()
    deleteMock.mockReset()
    deleteWhereMock.mockReset()
    setRoleMock.mockReset()
    createBootstrapUserMock.mockReset()
    signUpEmailMock.mockReset()

    selectMock.mockReturnValue({ from: selectFromMock })
    selectFromMock.mockReturnValue({ where: selectWhereMock })
    selectWhereMock.mockReturnValue({ limit: selectLimitMock })
    deleteMock.mockReturnValue({ where: deleteWhereMock })

    process.env.NODE_ENV = 'test'
    process.env.ADMIN_EMAIL = 'admin@voyager.local'
    process.env.ADMIN_PASSWORD = 'admin123'
    process.env.ADMIN_NAME = 'Voyager Admin'
  })

  it('does not delete/recreate admin when credential account is missing', async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 'admin-001', role: 'admin' }])
      .mockResolvedValueOnce([])

    const { ensureAdminUser } = await import('../lib/ensure-admin-user.js')
    await ensureAdminUser()

    expect(deleteMock).not.toHaveBeenCalled()
    expect(createBootstrapUserMock).not.toHaveBeenCalled()
    expect(setRoleMock).not.toHaveBeenCalled()
  })

  it('does not delete/recreate admin when credential hash is modern/non-legacy', async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 'admin-001', role: 'admin' }])
      .mockResolvedValueOnce([{ password: '$argon2id$v=19$m=65536,t=3,p=4$modernhash' }])

    const { ensureAdminUser } = await import('../lib/ensure-admin-user.js')
    await ensureAdminUser()

    expect(deleteMock).not.toHaveBeenCalled()
    expect(createBootstrapUserMock).not.toHaveBeenCalled()
    expect(setRoleMock).not.toHaveBeenCalled()
  })

  it('recreates admin only when legacy bcrypt credential hash is confirmed', async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: 'admin-001', role: 'admin' }])
      .mockResolvedValueOnce([{ password: '$2a$10$legacyhash' }])
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
})
