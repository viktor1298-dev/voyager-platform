'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { PageTransition } from '@/components/animations/PageTransition'
import { VoyagerLogo } from '@/components/VoyagerLogo'
import { LoginThemeToggle } from '@/components/LoginThemeToggle'
import { authClient, getAuthBaseUrl } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'
import { useAuthStore } from '@/stores/auth'
import { toast } from 'sonner'

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .refine((value) => /^[^\s@]+@[^\s@]+$/.test(value), 'Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const LOGGED_OUT_GRACE_MS = 5000
const LEGACY_LOGGED_OUT_GRACE_MS = 1200

function formatFieldError(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }

  try {
    return JSON.stringify(error)
  } catch {
    return 'Invalid value'
  }
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [timeTick, setTimeTick] = useState(0)
  const [legacyLoggedOutStartedAt] = useState(() => Date.now())
  const [isRedirectingAfterLogin, setIsRedirectingAfterLogin] = useState(false)
  const [shouldBypassLoggedOutRedirect, setShouldBypassLoggedOutRedirect] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const { data: session, isPending } = authClient.useSession()
  const providersQuery = trpc.sso.getProviders.useQuery(undefined, { retry: false })

  const returnUrl = useMemo(() => {
    const requestedReturnUrl = searchParams.get('returnUrl')
    if (requestedReturnUrl && requestedReturnUrl.startsWith('/') && !requestedReturnUrl.startsWith('//')) {
      return requestedReturnUrl
    }
    return '/'
  }, [searchParams])

  const loggedOutFlag = searchParams.get('loggedOut') === '1'
  const loggedOutAtRaw = searchParams.get('loggedOutAt')
  const parsedLoggedOutAt = loggedOutAtRaw ? Number(loggedOutAtRaw) : Number.NaN
  const now = useMemo(() => Date.now(), [timeTick, searchParams])

  const loggedOutAgeMs = Number.isFinite(parsedLoggedOutAt) ? now - parsedLoggedOutAt : Number.NaN
  const hasValidTimestampedLoggedOut = Number.isFinite(loggedOutAgeMs) && loggedOutAgeMs >= 0 && loggedOutAgeMs <= LOGGED_OUT_GRACE_MS

  const timestampedGraceRemainingMs = hasValidTimestampedLoggedOut
    ? Math.max(0, LOGGED_OUT_GRACE_MS - loggedOutAgeMs)
    : 0
  const legacyGraceRemainingMs = loggedOutFlag && !loggedOutAtRaw
    ? Math.max(0, LEGACY_LOGGED_OUT_GRACE_MS - (now - legacyLoggedOutStartedAt))
    : 0

  const isTimestampedGraceActive = hasValidTimestampedLoggedOut && timestampedGraceRemainingMs > 0
  const isLegacyGraceActive = loggedOutFlag && !loggedOutAtRaw && legacyGraceRemainingMs > 0
  const isLoggedOutRedirect = !shouldBypassLoggedOutRedirect && (isTimestampedGraceActive || isLegacyGraceActive)

  useEffect(() => {
    if (!isLoggedOutRedirect) return
    const remainingMs = isTimestampedGraceActive ? timestampedGraceRemainingMs : legacyGraceRemainingMs
    if (remainingMs <= 0) return
    const timeout = window.setTimeout(() => {
      setTimeTick((prev) => prev + 1)
    }, remainingMs + 10)
    return () => window.clearTimeout(timeout)
  }, [isLoggedOutRedirect, isTimestampedGraceActive, legacyGraceRemainingMs, timestampedGraceRemainingMs])

  useEffect(() => {
    if (!loggedOutFlag) return
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('logoutInProgress')
    }
    useAuthStore.getState().clearUser()
  }, [loggedOutFlag])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isTimestampedGraceActive) return
    const normalizedParams = new URLSearchParams()
    normalizedParams.set('loggedOut', '1')
    normalizedParams.set('loggedOutAt', String(parsedLoggedOutAt))
    if (returnUrl !== '/') {
      normalizedParams.set('returnUrl', returnUrl)
    }
    const expectedSearch = `?${normalizedParams.toString()}`
    if (window.location.pathname === '/login' && window.location.search !== expectedSearch) {
      window.history.replaceState(null, '', `/login${expectedSearch}`)
    }
  }, [isTimestampedGraceActive, parsedLoggedOutAt, returnUrl])

  useEffect(() => {
    if (!session?.user) return
    if (!loggedOutFlag && !loggedOutAtRaw) return
    if (isTimestampedGraceActive || isLegacyGraceActive) return
    setShouldBypassLoggedOutRedirect(true)
  }, [isLegacyGraceActive, isTimestampedGraceActive, loggedOutAtRaw, loggedOutFlag, session])

  useEffect(() => {
    if (isLoggedOutRedirect || isRedirectingAfterLogin) return
    if (loggedOutFlag && (isTimestampedGraceActive || isLegacyGraceActive)) return
    if (!isPending && session?.user) {
      router.replace(returnUrl)
      router.refresh()
    }
  }, [isLegacyGraceActive, isLoggedOutRedirect, isPending, isRedirectingAfterLogin, isTimestampedGraceActive, loggedOutFlag, returnUrl, router, session])

  async function redirectAfterSuccessfulLogin() {
    setShouldBypassLoggedOutRedirect(true)
    setIsRedirectingAfterLogin(true)

    const maxAttempts = 8
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const sessionResult = await authClient.getSession()
      if (sessionResult.data?.user) {
        const user = sessionResult.data.user
        useAuthStore.getState().setUser({
          id: user.id,
          email: user.email,
          name: (user.name && !/^<[^>]+>$/.test(user.name.trim())) ? user.name : user.email,
          role: (user as { role?: string }).role === 'admin' ? 'admin' : 'viewer',
        })
        router.replace(returnUrl)
        router.refresh()
        return
      }
      await new Promise((resolve) => window.setTimeout(resolve, 150 * (attempt + 1)))
    }

    setIsRedirectingAfterLogin(false)
    setLoginError('Login succeeded but session is still loading. Please wait a moment and try again.')
  }

  const microsoftProvider = providersQuery.data?.find((provider) => provider.id === 'microsoft-entra-id' && provider.enabled)

  async function signInWithMicrosoft() {
    setLoginError(null)
    try {
      const response = await fetch(`${getAuthBaseUrl()}/api/auth/sign-in/oauth2`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'microsoft-entra-id',
          callbackURL: `${window.location.origin}${returnUrl}`,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to start Microsoft sign-in (HTTP ${response.status})`)
      }

      const payload = (await response.json()) as { url?: string }
      if (!payload.url) {
        throw new Error('Missing redirect URL from authentication provider')
      }

      window.location.href = payload.url
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to start Microsoft sign-in flow')
    }
  }

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: {
      onChange: loginSchema,
    },
    onSubmit: async ({ value }) => {
      setLoginError(null)

      const { data, error } = await authClient.signIn.email({
        email: value.email,
        password: value.password,
      })

      if (error) {
        setLoginError(error.message ?? 'Invalid credentials. Please check your email and password.')
        return
      }

      const signedInEmail = data?.user?.email ?? value.email

      if (data?.user) {
        useAuthStore.getState().setUser({
          id: data.user.id,
          email: data.user.email,
          name: (data.user.name && !/^<[^>]+>$/.test(data.user.name.trim())) ? data.user.name : data.user.email,
          role: (data.user as { role?: string }).role === 'admin' ? 'admin' : 'viewer',
        })
      }

      toast.success('Welcome back!', { description: `Signed in as ${signedInEmail}` })
      await redirectAfterSuccessfulLogin()
    },
  })

  return (
    <PageTransition className="relative flex min-h-screen login-gradient">
      {/* Theme toggle — top right corner (Item #2) */}
      <div className="absolute right-4 top-4 z-10">
        <LoginThemeToggle />
      </div>

      {/* Split-screen layout */}
      <div className="flex w-full flex-col lg:flex-row">
        {/* Left panel — Branding hero (Item #1) */}
        <div className="hidden lg:flex lg:w-1/2 items-center justify-center relative overflow-hidden">
          {/* Decorative gradient orbs */}
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[var(--color-accent)] opacity-[0.07] blur-3xl" />
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-500 opacity-[0.05] blur-3xl" />

          <div className="relative z-10 flex flex-col items-center px-12 text-center">
            <VoyagerLogo size={96} className="mb-8 text-[var(--color-text-muted)]" />
            <h1 className="mb-3 text-4xl font-bold tracking-tight text-[var(--color-text-primary)]">
              Voyager Platform
            </h1>
            <p className="max-w-sm text-lg text-[var(--color-text-secondary)]">
              Navigate your Kubernetes fleet with confidence. Monitor, manage, and optimize — all in one place.
            </p>

            {/* Decorative dots grid */}
            <div className="mt-12 grid grid-cols-5 gap-2 opacity-20">
              {Array.from({ length: 25 }).map((_, i) => (
                <div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
                  style={{ opacity: Math.random() * 0.7 + 0.3 }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right panel — Login form */}
        <div className="flex flex-1 items-center justify-center px-4 py-10 lg:w-1/2">
          <div className="w-full max-w-sm">
            {/* Mobile logo (shown on smaller screens) */}
            <div className="mb-8 flex flex-col items-center lg:hidden">
              <VoyagerLogo size={64} className="mb-4 text-[var(--color-text-muted)]" />
              <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
                Voyager Platform
              </h1>
            </div>

            {/* Card */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 shadow-xl sm:p-8">
              <h2 className="mb-1 text-center text-xl font-semibold text-[var(--color-text-primary)]">
                Welcome back
              </h2>
              <p className="mb-6 text-center text-sm text-[var(--color-text-muted)]">
                Sign in to continue to your dashboard
              </p>

              {/* Inline login error (Item #3) */}
              {loginError && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400 dark:text-red-400"
                >
                  <p className="flex items-start gap-2">
                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                    </svg>
                    <span>{loginError}</span>
                  </p>
                </div>
              )}

              {microsoftProvider && (
                <button
                  type="button"
                  onClick={signInWithMicrosoft}
                  className="mb-4 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-2 font-medium text-[var(--color-text-primary)] transition hover:opacity-90 min-h-[44px]"
                >
                  Sign in with Microsoft
                </button>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  form.handleSubmit()
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]">
                    Email
                  </label>
                  <form.Field name="email">
                    {(field) => (
                      <>
                        <input
                          id="email"
                          type="email"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                          placeholder="admin@voyager.local"
                          autoComplete="email"
                        />
                        {field.state.meta.errors?.length > 0 && (
                          <p className="mt-1 text-xs text-red-400">{field.state.meta.errors.map((e) => formatFieldError(e)).join(', ')}</p>
                        )}
                      </>
                    )}
                  </form.Field>
                </div>

                <div>
                  <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]">
                    Password
                  </label>
                  <form.Field name="password">
                    {(field) => (
                      <>
                        <input
                          id="password"
                          type="password"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                          placeholder="••••••••"
                          autoComplete="current-password"
                        />
                        {field.state.meta.errors?.length > 0 && (
                          <p className="mt-1 text-xs text-red-400">{field.state.meta.errors.map((e) => formatFieldError(e)).join(', ')}</p>
                        )}
                      </>
                    )}
                  </form.Field>

                  {/* Forgot password link (Item #4) */}
                  <div className="mt-1.5 text-right">
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        toast.info('Contact your administrator to reset your password.', {
                          description: 'Password reset is managed by your organization admin.',
                          duration: 5000,
                        })
                      }}
                      className="text-xs text-[var(--color-accent)] hover:underline focus:outline-none focus:underline"
                    >
                      Forgot password?
                    </a>
                  </div>
                </div>

                {/* Sign In button with loading state (Item #5) */}
                <form.Subscribe selector={(s) => s.isSubmitting}>
                  {(isSubmitting) => {
                    const isLoading = isSubmitting || isRedirectingAfterLogin
                    return (
                      <button
                        type="submit"
                        disabled={isLoading}
                        data-testid="login-submit"
                        className="relative w-full rounded-lg bg-[var(--color-accent)] py-2.5 font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
                      >
                        {isLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            <span>Signing in…</span>
                          </span>
                        ) : (
                          'Sign In'
                        )}
                      </button>
                    )
                  }}
                </form.Subscribe>
              </form>
            </div>

            {/* Footer */}
            <p className="mt-6 text-center text-xs text-[var(--color-text-dim)]">
              Voyager Platform · Kubernetes Operations Dashboard
            </p>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  )
}
