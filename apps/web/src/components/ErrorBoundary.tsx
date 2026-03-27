'use client'

import * as Sentry from '@sentry/nextjs'
import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { motion } from 'motion/react'
import { DURATION } from '@/lib/animation-constants'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } })
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.slow, ease: 'easeOut' }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <AlertTriangle className="h-10 w-10 text-[var(--color-status-error)] mb-4" />
          <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-4 max-w-md">
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity cursor-pointer"
          >
            Try Again
          </button>
        </motion.div>
      )
    }
    return this.props.children
  }
}

const CONFIG_CREDENTIAL_FIELDS = [
  'accessKeyId',
  'secretAccessKey',
  'kubeconfig',
  'apiKey',
  'token',
  'credentials',
] as const

/** Parse raw tRPC/Zod JSON error messages into human-readable text. */
function parseErrorMessage(raw: string): { title: string; description: string } {
  // Try to detect raw JSON Zod validation errors
  try {
    const parsed = JSON.parse(raw) as unknown
    const arr = Array.isArray(parsed) ? parsed : null
    if (arr && arr.length > 0) {
      const first = arr[0] as Record<string, unknown>
      // Check for known Zod field errors pointing to cloud/config fields
      const hasConfigField = arr.some((e) => {
        const path = (e as Record<string, unknown>).path
        return (
          Array.isArray(path) &&
          path.some((p) => (CONFIG_CREDENTIAL_FIELDS as readonly string[]).includes(String(p)))
        )
      })
      if (hasConfigField) {
        return {
          title: 'Connection Configuration Required',
          description:
            'This feature requires valid cloud credentials. Please configure your connection settings first.',
        }
      }
      // Generic validation error
      const msg = typeof first.message === 'string' ? first.message : 'Validation failed'
      return { title: 'Configuration Error', description: msg }
    }
  } catch {
    // Not JSON — fall through
  }
  // Check for known human-readable tRPC patterns
  if (raw.includes('UNAUTHORIZED') || raw.includes('401')) {
    return { title: 'Session Expired', description: 'Please sign in again to continue.' }
  }
  if (raw.includes('FORBIDDEN') || raw.includes('403')) {
    return {
      title: 'Access Denied',
      description: 'You do not have permission to view this resource.',
    }
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return { title: 'Not Found', description: 'The requested resource could not be found.' }
  }
  return { title: 'Failed to load data', description: raw }
}

export function QueryError({
  message,
  onRetry,
  title,
}: {
  message: string
  onRetry?: () => void
  title?: string
}) {
  const parsed = parseErrorMessage(message)
  const displayTitle = title ?? parsed.title
  const displayDescription = parsed.description

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <AlertTriangle className="h-10 w-10 text-[var(--color-status-error)] mb-4" />
      <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">{displayTitle}</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-4 max-w-md">{displayDescription}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity cursor-pointer"
        >
          Try Again
        </button>
      )}
    </motion.div>
  )
}
