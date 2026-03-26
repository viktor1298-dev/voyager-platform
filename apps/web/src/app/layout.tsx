import { Providers } from '@/components/providers'
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const geistSans = localFont({
  src: './fonts/GeistVF.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
  preload: true,
})

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: {
    default: 'Voyager Platform',
    template: '%s — Voyager Platform',
  },
  description: 'Kubernetes Operations Dashboard',
  icons: {
    icon: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="h-0.5 w-full bg-gradient-to-r from-teal-500 to-indigo-500 fixed top-0 left-0 z-[200]" />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
