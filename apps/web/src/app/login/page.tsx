'use client'

import { useForm } from '@tanstack/react-form'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { authClient } from '@/lib/auth-client'
import { useAuthStore } from '@/stores/auth'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export default function LoginPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [isSocialLoading, setIsSocialLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) router.push('/')
  }, [isAuthenticated, router])

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
      }
      router.push('/')
    },
  })

  const signInWithMicrosoft = async () => {
    setIsSocialLoading(true)
    try {
      const { error } = await authClient.signIn.social({
        provider: 'microsoft-entra-id',
        callbackURL: '/',
      })
      if (error) {
        toast.error('Microsoft sign-in failed', {
          description: error.message ?? 'Unable to continue with Microsoft Entra ID',
        })
      }
    } finally {
      setIsSocialLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-primary)]">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 shadow-xl">
        <h1 className="mb-6 text-center text-2xl font-bold text-[var(--color-text-primary)]">
          Voyager Platform
        </h1>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]"
            >
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
                  />
                  {field.state.meta.errors?.length > 0 && (
                    <p className="mt-1 text-xs text-red-400">
                      {field.state.meta.errors.map((e) => String(e)).join(', ')}
                    </p>
                  )}
                </>
              )}
            </form.Field>
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]"
            >
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
                  />
                  {field.state.meta.errors?.length > 0 && (
                    <p className="mt-1 text-xs text-red-400">
                      {field.state.meta.errors.map((e) => String(e)).join(', ')}
                    </p>
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

        <div className="my-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-[var(--color-border)]" />
          <span className="text-xs text-[var(--color-text-dim)]">or</span>
          <div className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        <button
          type="button"
          onClick={signInWithMicrosoft}
          disabled={isSocialLoading}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-2 font-medium text-[var(--color-text-primary)] transition hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          {isSocialLoading ? 'Redirecting to Microsoft…' : 'Continue with Microsoft'}
        </button>
      </div>
    </div>
  )
}
