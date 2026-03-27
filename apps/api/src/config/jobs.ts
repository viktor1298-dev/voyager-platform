/** Background job polling intervals — all values in milliseconds */

export const JOB_INTERVALS = {
  ALERT_EVAL_MS: 60 * 1000,
  ALERT_DEDUP_WINDOW_MS: 5 * 60 * 1000,
  EVENT_SYNC_MS: 2 * 60 * 1000,
  METRICS_COLLECT_MS: 60 * 1000,
  HEALTH_SYNC_MS: 5 * 60 * 1000,
  NODE_SYNC_MS: 5 * 60 * 1000,
  DEPLOY_SMOKE_DELAY_MS: 30 * 1000, // Wait 30s after rollout before checking
} as const
