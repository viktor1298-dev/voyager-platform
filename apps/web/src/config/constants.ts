export const SYNC_INTERVAL_MS = 30_000

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'v0.1.0'

/** Maximum width for main content area (px) */
export const MAX_CONTENT_WIDTH = 1200

/** Lookback window for stats queries (ms) — 48 hours */
export const STATS_LOOKBACK_MS = 48 * 60 * 60 * 1000
