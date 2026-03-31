import { alertHistory, auditLog, db, healthHistory, webhookDeliveries } from '@voyager/db'
import { lt } from 'drizzle-orm'
import { JOB_INTERVALS } from '../config/jobs.js'

const RETENTION_DAYS = {
  HEALTH_HISTORY: 30,
  AUDIT_LOG: 90,
  ALERT_HISTORY: 30,
  WEBHOOK_DELIVERIES: 30,
} as const

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

async function runRetention(): Promise<void> {
  const tables = [
    {
      name: 'health_history',
      table: healthHistory,
      col: healthHistory.checkedAt,
      days: RETENTION_DAYS.HEALTH_HISTORY,
    },
    { name: 'audit_log', table: auditLog, col: auditLog.timestamp, days: RETENTION_DAYS.AUDIT_LOG },
    {
      name: 'alert_history',
      table: alertHistory,
      col: alertHistory.triggeredAt,
      days: RETENTION_DAYS.ALERT_HISTORY,
    },
    {
      name: 'webhook_deliveries',
      table: webhookDeliveries,
      col: webhookDeliveries.deliveredAt,
      days: RETENTION_DAYS.WEBHOOK_DELIVERIES,
    },
  ] as const

  for (const { name, table, col, days } of tables) {
    try {
      const cutoff = daysAgo(days)
      const result = await db.delete(table).where(lt(col, cutoff))
      const count = result.rowCount ?? 0
      if (count > 0) {
        console.log(`[data-retention] deleted ${count} rows from ${name} older than ${days}d`)
      }
    } catch (error) {
      console.error(`[data-retention] failed to clean ${name}`, error)
    }
  }
}

let intervalHandle: NodeJS.Timeout | null = null
let isRunning = false

export function startDataRetention(): void {
  if (intervalHandle) return

  const run = async () => {
    if (isRunning) return
    isRunning = true
    try {
      await runRetention()
    } catch (error) {
      console.error('[data-retention] job run failed', error)
    } finally {
      isRunning = false
    }
  }

  void run()
  intervalHandle = setInterval(() => {
    void run()
  }, JOB_INTERVALS.DATA_RETENTION_MS)
}

export function stopDataRetention(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
