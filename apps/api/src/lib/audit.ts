import type { Database } from '@voyager/db'
import { auditLog } from '@voyager/db'
import { createComponentLogger } from './logger.js'

const log = createComponentLogger('audit')

interface AuditContext {
  db: Database
  user: { id: string; email: string }
  ipAddress?: string
}

export async function logAudit(
  ctx: AuditContext,
  action: string,
  resource: string,
  resourceId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await ctx.db.insert(auditLog).values({
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      action,
      resource,
      resourceId: resourceId ?? null,
      details: details ? JSON.stringify(details) : null,
      ipAddress: ctx.ipAddress ?? null,
    })
  } catch (err) {
    // Audit logging should never break the main operation
    log.error({ err }, 'Failed to write audit log')
  }
}
