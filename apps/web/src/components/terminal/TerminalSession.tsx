'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'

interface TerminalSessionProps {
  clusterId: string
  namespace: string
  podName: string
  container: string
  isActive: boolean
}

function getTerminalTheme(): Record<string, string> {
  const style = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    background: get('--color-terminal-bg', '#1a1b26'),
    foreground: get('--color-terminal-fg', '#c0caf5'),
    cursor: get('--color-terminal-cursor', '#c0caf5'),
    cursorAccent: get('--color-terminal-bg', '#1a1b26'),
    selectionBackground: get('--color-terminal-selection', 'rgba(99,110,123,0.4)'),
    black: '#414868',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#c0caf5',
    brightBlack: '#565f89',
    brightRed: '#f7768e',
    brightGreen: '#9ece6a',
    brightYellow: '#e0af68',
    brightBlue: '#7aa2f7',
    brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff',
    brightWhite: '#c0caf5',
  }
}

export function TerminalSession({
  clusterId,
  namespace,
  podName,
  container,
  isActive,
}: TerminalSessionProps) {
  // SSR safety (Gotcha #13): useState + useEffect, NOT typeof window
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null)
  const fitAddonRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Initialize xterm.js + WebSocket on mount
  useEffect(() => {
    if (!mounted || !containerRef.current) return

    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let fitTimeout: ReturnType<typeof setTimeout> | null = null

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      await import('@xterm/xterm/css/xterm.css')
      const { FitAddon } = await import('@xterm/addon-fit')

      if (disposed || !containerRef.current) return

      const theme = getTerminalTheme()
      const term = new Terminal({
        fontSize: 13,
        fontFamily: 'var(--font-geist-mono), "Cascadia Code", "Fira Code", monospace',
        cursorBlink: true,
        screenReaderMode: true,
        theme,
        allowProposedApi: true,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(containerRef.current)

      // Defer fit to let layout stabilize
      requestAnimationFrame(() => {
        if (!disposed) fitAddon.fit()
      })

      termRef.current = term
      fitAddonRef.current = fitAddon

      // WebSocket connection
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${proto}//${window.location.host}/api/pod-terminal?clusterId=${encodeURIComponent(clusterId)}&namespace=${encodeURIComponent(namespace)}&podName=${encodeURIComponent(podName)}&container=${encodeURIComponent(container)}`

      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        term.writeln('\x1b[32mConnected to pod terminal\x1b[0m')
      }

      ws.onmessage = (event) => {
        term.write(new Uint8Array(event.data as ArrayBuffer))
      }

      ws.onclose = (event) => {
        term.writeln('')
        term.writeln(
          `\x1b[33mTerminal session ended${event.reason ? `: ${event.reason}` : ''}\x1b[0m`,
        )
      }

      ws.onerror = () => {
        term.writeln('\x1b[31mConnection failed\x1b[0m')
      }

      // Forward terminal input to WebSocket
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(data))
        }
      })

      // Resize observer with debounce
      resizeObserver = new ResizeObserver(() => {
        if (fitTimeout) clearTimeout(fitTimeout)
        fitTimeout = setTimeout(() => {
          if (!disposed && fitAddonRef.current) {
            fitAddonRef.current.fit()
          }
        }, 150)
      })
      resizeObserver.observe(containerRef.current)
    }

    init()

    return () => {
      disposed = true
      if (fitTimeout) clearTimeout(fitTimeout)
      if (resizeObserver) resizeObserver.disconnect()
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        wsRef.current.close()
      }
      wsRef.current = null
      if (termRef.current) {
        termRef.current.dispose()
        termRef.current = null
      }
      fitAddonRef.current = null
    }
  }, [mounted, clusterId, namespace, podName, container])

  // Theme change: update xterm.js theme colors
  useEffect(() => {
    if (!mounted || !termRef.current) return
    const theme = getTerminalTheme()
    termRef.current.options.theme = theme
  }, [resolvedTheme, mounted])

  if (!mounted) {
    return (
      <div
        style={{ display: isActive ? 'flex' : 'none' }}
        className="flex-1 items-center justify-center bg-[var(--color-terminal-bg,#1a1b26)]"
      >
        <span className="text-xs text-[var(--color-text-secondary)]">Loading terminal...</span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{ display: isActive ? 'block' : 'none' }}
      className="flex-1 min-h-0 bg-[var(--color-terminal-bg,#1a1b26)] p-1"
    />
  )
}
