'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { PageTransition } from '@/components/animations/PageTransition'
import { authClient, getAuthBaseUrl } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'
import { useAuthStore } from '@/stores/auth'
import { toast } from 'sonner'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export default function LoginPage() {
  const router = useRouter()
  const [returnUrl, setReturnUrl] = useState('/')
  const [isLoggedOutRedirect, setIsLoggedOutRedirect] = useState(false)
  const { data: session, isPending } = authClient.useSession()
  const providersQuery = trpc.sso.getProviders.useQuery(undefined, { retry: false })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedReturnUrl = params.get('returnUrl')
    const loggedOut = params.get('loggedOut') === '1'
    setIsLoggedOutRedirect(loggedOut)

    // Validate returnUrl: must start with '/' but not '//' (to prevent protocol-relative URLs)
    if (requestedReturnUrl && requestedReturnUrl.startsWith('/') && !requestedReturnUrl.startsWith('//')) {
      setReturnUrl(requestedReturnUrl)
    }
  }, [])

  useEffect(() => {
    if (isLoggedOutRedirect) return
    if (!isPending && session?.user) {
      router.replace(returnUrl)
    }
  }, [isLoggedOutRedirect, isPending, returnUrl, router, session])

  const microsoftProvider = providersQuery.data?.find((provider) => provider.id === 'microsoft-entra-id' && provider.enabled)

  async function signInWithMicrosoft() {
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
      toast.error('Microsoft sign-in failed', {
        description: error instanceof Error ? error.message : 'Unable to start Microsoft sign-in flow',
      })
    }
  }

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: {
      onChange: loginSchema,
    },
    onSubmit: async ({ value }) => {
      const { data, error } = await authClient.signIn.email({
        email: value.email,
        password: value.password,
      })

      if (error) {
        toast.error('Login failed', { description: error.message ?? 'Invalid credentials' })
        return
      }

      if (data?.user) {
        useAuthStore.getState().setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.name ?? data.user.email,
          role: (data.user as { role?: string }).role === 'admin' ? 'admin' : 'viewer',
        })
        toast.success('Welcome back!', { description: `Signed in as ${data.user.email}` })
        router.replace(returnUrl)
      }
    },
  })

  return (
    <PageTransition className="flex min-h-screen items-center justify-center bg-[var(--color-bg-primary)] px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 shadow-xl sm:p-8">
        <h1 className="mb-2 text-center text-2xl font-bold text-[var(--color-text-primary)]">Voyager Platform</h1>
        <p className="mb-6 text-center text-sm text-[var(--color-text-muted)]">Sign in to continue to your dashboard</p>

        {microsoftProvider && (
          <button
            type="button"
            onClick={signInWithMicrosoft}
            className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-2 font-medium text-[var(--color-text-primary)] transition hover:opacity-90"
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
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    placeholder="admin@voyager.local"
                    autoComplete="email"
                  />
                  {field.state.meta.errors?.length > 0 && (
                    <p className="mt-1 text-xs text-red-400">{field.state.meta.errors.map((e) => String(e)).join(', ')}</p>
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
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  {field.state.meta.errors?.length > 0 && (
                    <p className="mt-1 text-xs text-red-400">{field.state.meta.errors.map((e) => String(e)).join(', ')}</p>
                  )}
                </>
              )}
            </form.Field>
          </div>

          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-[var(--color-accent)] py-2 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </button>
            )}
          </form.Subscribe>
        </form>
      </div>
    </PageTransition>
  )
}
