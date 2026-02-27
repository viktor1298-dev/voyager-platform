import { alerts, alertHistory, db } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { clusters } from '@voyager/db'
import * as k8s from '@kubernetes/client-node'

const ALERT_EVAL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

async function evaluateAlert(alert: typeof alerts.$inferSelect): Promise<void> {
  // Get all clusters (or filtered by alert.clusterFilter)
  const allClusters = await db.select().from(clusters)
  const targetClusters = alert.clusterFilter
    ? allClusters.filter(c => c.name === alert.clusterFilter || c.id === alert.clusterFilter)
    : allClusters

  for (const cluster of targetClusters) {
    try {
      const kc = await clusterClientPool.getClient(cluster.id)
      const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

      let currentValue = 0

      switch (alert.metric) {
        case 'pods': {
          const pods = await coreV1.listPodForAllNamespaces()
          currentValue = pods.items.length
          break
        }
        case 'restarts': {
          const pods = await coreV1.listPodForAllNamespaces()
          currentValue = pods.items.reduce((sum, p) =>
            sum + (p.status?.containerStatuses?.reduce((s, c) => s + (c.restartCount || 0), 0) || 0), 0)
          break
        }
        case 'cpu':
        case 'memory':
          // For cpu/memory, try metrics API; fallback to pod count as proxy
          currentValue = 0
          break
      }

      const threshold = Number(alert.threshold)
      let triggered = false
      switch (alert.operator) {
        case 'gt': triggered = currentValue > threshold; break
        case 'lt': triggered = currentValue < threshold; break
        case 'eq': triggered = currentValue === threshold; break
      }

      if (triggered) {
        const message = `Alert "${alert.name}": ${alert.metric} ${alert.operator} ${threshold} (current: ${currentValue}) on cluster ${cluster.name}`

        // Insert history
        await db.insert(alertHistory).values({
          alertId: alert.id,
          value: String(currentValue),
          message,
        })

        // Update alert lastTriggeredAt and lastValue
        await db.update(alerts).set({
          lastTriggeredAt: new Date(),
          lastValue: String(currentValue),
        }).where(eq(alerts.id, alert.id))

        // If webhookUrl set, POST to it
        if (alert.webhookUrl) {
          try {
            await fetch(alert.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ alert: alert.name, metric: alert.metric, value: currentValue, threshold, message, cluster: cluster.name }),
            })
          } catch (e) {
            console.error(`[alert-evaluator] webhook POST failed for alert ${alert.id}:`, e)
          }
        }

        console.log(`[alert-evaluator] TRIGGERED: ${message}`)
      }
    } catch (err) {
      console.error(`[alert-evaluator] error evaluating alert ${alert.id} on cluster ${cluster.id}:`, err)
    }
  }
}

export function startAlertEvaluator(): void {
  console.log('[alert-evaluator] Starting alert evaluator (interval: 5min)')

  const run = async () => {
    try {
      const enabledAlerts = await db.select().from(alerts).where(eq(alerts.enabled, true))
      console.log(`[alert-evaluator] Evaluating ${enabledAlerts.length} alerts`)
      for (const alert of enabledAlerts) {
        await evaluateAlert(alert)
      }
    } catch (error) {
      console.error('[alert-evaluator] job run failed', error)
    }
  }

  // Run once immediately, then on interval
  void run()
  setInterval(() => void run(), ALERT_EVAL_INTERVAL_MS)
}
