import type { IncomingHttpHeaders } from 'node:http'

const DEFAULT_HOST = 'localhost'
const DEFAULT_PROTO = 'http'

const getFirstHeaderValue = (value: string | string[] | undefined): string | null => {
  if (!value) return null
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null

  const first = raw
    .split(',')
    .map((part) => part.trim())
    .find(Boolean)

  return first ?? null
}

const normalizeProtocol = (value: string | null | undefined): string | null => {
  if (!value) return null
  const proto = value.trim().toLowerCase()
  return proto === 'http' || proto === 'https' ? proto : null
}

const normalizeHost = (value: string | null | undefined): string | null => {
  if (!value) return null
  const host = value.trim()
  if (!host || /\s/.test(host) || /[/?#]/.test(host)) return null

  try {
    const parsed = new URL(`http://${host}`)
    if (!parsed.hostname || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null
    }
    return parsed.host
  } catch {
    return null
  }
}

type ExternalOriginInput = {
  headers: IncomingHttpHeaders
  trustedProtocol?: string | null
  trustedHost?: string | null
  trustForwardedHeaders?: boolean
}

export const resolveExternalRequestOrigin = ({
  headers,
  trustedProtocol,
  trustedHost,
  trustForwardedHeaders = false,
}: ExternalOriginInput): string => {
  const protoCandidates = [
    trustForwardedHeaders ? getFirstHeaderValue(headers['x-forwarded-proto']) : null,
    trustedProtocol,
  ]

  const hostCandidates = [
    trustForwardedHeaders ? getFirstHeaderValue(headers['x-forwarded-host']) : null,
    trustedHost,
    getFirstHeaderValue(headers.host),
  ]

  const proto = protoCandidates.map(normalizeProtocol).find(Boolean) ?? DEFAULT_PROTO
  const host = hostCandidates.map(normalizeHost).find(Boolean) ?? DEFAULT_HOST

  return `${proto}://${host}`
}

export const resolveExternalRequestUrl = (requestUrl: string, input: ExternalOriginInput): URL =>
  new URL(requestUrl, resolveExternalRequestOrigin(input))
