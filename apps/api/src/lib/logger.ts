import pino from 'pino'
import type { FastifyBaseLogger } from 'fastify'

let _logger: FastifyBaseLogger

// Fallback logger used before Fastify boots (early module init, tests).
// Uses pino directly so child loggers, levels, and serializers all work.
const _fallback: FastifyBaseLogger = pino({ level: 'info' }) as unknown as FastifyBaseLogger

/** Initialize the global logger — call once after Fastify boots */
export function initLogger(logger: FastifyBaseLogger) {
  _logger = logger
}

/** Get the root application logger */
export function getLogger(): FastifyBaseLogger {
  return _logger ?? _fallback
}

/** Create a child logger scoped to a component (e.g., 'watch-manager', 'alert-evaluator') */
export function createComponentLogger(component: string): FastifyBaseLogger {
  return (_logger ?? _fallback).child({ component })
}

/** Create a child logger scoped to a cluster operation */
export function createClusterLogger(component: string, clusterId: string): FastifyBaseLogger {
  return (_logger ?? _fallback).child({ component, clusterId })
}
