/** Background job polling intervals — all values in milliseconds */

export const JOB_INTERVALS = {
  ALERT_EVAL_MS: 60 * 1000,
  ALERT_DEDUP_WINDOW_MS: 5 * 60 * 1000,
  METRICS_COLLECT_MS: 60 * 1000,
  DEPLOY_SMOKE_DELAY_MS: 30 * 1000, // Wait 30s after rollout before checking
  METRICS_STREAM_POLL_MS: 15 * 1000, // Live metrics SSE polling interval
} as const
