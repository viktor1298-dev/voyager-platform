/** SSE (Server-Sent Events) configuration constants */

/** How often the server sends a heartbeat ping to keep the connection alive (ms) */
export const SSE_HEARTBEAT_INTERVAL_MS = 30_000

/** Maximum time a client waits before reconnecting after disconnect (ms) */
export const SSE_MAX_RECONNECT_DELAY_MS = 30_000

/** Initial reconnect delay for exponential backoff (ms) */
export const SSE_INITIAL_RECONNECT_DELAY_MS = 1_000

/** Backoff multiplier for reconnection attempts */
export const SSE_RECONNECT_BACKOFF_MULTIPLIER = 2

/** Maximum number of reconnection attempts before giving up (0 = infinite) */
export const SSE_MAX_RECONNECT_ATTEMPTS = 0

/** How often the metrics stream pushes updates (ms) */
export const SSE_METRICS_INTERVAL_MS = 5_000

/** How often the pod events stream polls K8s watch (ms) — fallback if watch disconnects */
export const SSE_POD_WATCH_RECONNECT_DELAY_MS = 5_000

/** Maximum number of events to buffer before dropping oldest */
export const SSE_EVENT_BUFFER_SIZE = 100

/** Log streaming: number of initial tail lines to send */
export const SSE_LOG_TAIL_LINES = 200

/** Log streaming: polling interval for new log lines (ms) */
export const SSE_LOG_POLL_INTERVAL_MS = 2_000

/** Deployment progress: polling interval (ms) */
export const SSE_DEPLOYMENT_PROGRESS_INTERVAL_MS = 3_000

/** Alert stream: check interval for new alerts (ms) */
export const SSE_ALERT_CHECK_INTERVAL_MS = 5_000
