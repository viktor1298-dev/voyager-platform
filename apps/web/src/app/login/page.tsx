'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from '@tanstack/react-form'
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
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    if (isAuthenticated) router.push('/')
  }, [isAuthenticated, router])

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: {
      onChange: loginSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError('')
      const { data, error } = await authClient.signIn.email({
        email: value.email,
        password: value.password,
      })
      if (error) {
        setServerError(error.message ?? 'Login failed')
        return
      }
      if (data?.user) {
        useAuthStore.getState().setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.name ?? data.user.email,
          role: (data.user as { role?: string }).role === 'admin' ? 'admin' : 'viewer',
        })
      }
      router.push('/')
    },
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <h1 className="mb-6 text-center text-2xl font-bold text-white">Voyager Platform</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="space-y-4"
        >
          {serverError && (
            <div className="rounded-lg bg-red-900/30 border border-red-800 px-4 py-2 text-sm text-red-400">
              {serverError}
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-400">
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
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-400">
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
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </button>
            )}
          </form.Subscribe>
        </form>
      </div>
    </div>
  )
}
