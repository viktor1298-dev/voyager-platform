import { ensureBootstrapUser } from './ensure-bootstrap-user.js'
import { createComponentLogger } from './logger.js'

const log = createComponentLogger('bootstrap')

const DEFAULT_VIEWER_EMAIL = 'viewer@voyager.local'
const DEFAULT_VIEWER_PASSWORD = 'viewer123'
const DEFAULT_VIEWER_NAME = 'Viewer User'
const LEGACY_SEEDED_VIEWER_USER_ID = 'viewer-001'

export async function ensureViewerUser(): Promise<void> {
  const viewerEmail = process.env.E2E_VIEWER_EMAIL ?? DEFAULT_VIEWER_EMAIL
  const viewerPassword = process.env.E2E_VIEWER_PASSWORD ?? DEFAULT_VIEWER_PASSWORD
  const viewerName = process.env.E2E_VIEWER_NAME ?? DEFAULT_VIEWER_NAME

  try {
    const userId = await ensureBootstrapUser({
      email: viewerEmail,
      password: viewerPassword,
      name: viewerName,
      desiredRole: 'viewer',
      legacyUserId: LEGACY_SEEDED_VIEWER_USER_ID,
    })

    log.info({ email: viewerEmail, userId }, 'Bootstrap viewer user ensured via Better-Auth')
  } catch (error) {
    log.error({ email: viewerEmail, err: error }, 'Failed to ensure viewer user')
    throw error
  }
}
