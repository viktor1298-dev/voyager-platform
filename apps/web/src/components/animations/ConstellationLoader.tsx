'use client'

import { useEffect, useRef } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface ConstellationLoaderProps {
  label?: string
}

interface Dot {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

const DOT_COUNT = 25
const CONNECTION_DISTANCE = 80
const DOT_SPEED = 0.3

function createDots(width: number, height: number): Dot[] {
  return Array.from({ length: DOT_COUNT }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * DOT_SPEED * 2,
    vy: (Math.random() - 0.5) * DOT_SPEED * 2,
    r: Math.random() * 1.5 + 1,
  }))
}

export function ConstellationLoader({ label = 'Loading resources...' }: ConstellationLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dotsRef = useRef<Dot[]>([])
  const rafRef = useRef<number>(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1

    function resize() {
      if (!canvas || !container || !ctx) return
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.scale(dpr, dpr)

      if (dotsRef.current.length === 0) {
        dotsRef.current = createDots(rect.width, rect.height)
      } else {
        for (const dot of dotsRef.current) {
          dot.x = Math.min(dot.x, rect.width)
          dot.y = Math.min(dot.y, rect.height)
        }
      }
    }

    resize()

    // Parse accent color — supports hex (#6366f1) and rgb(99, 102, 241)
    const computedStyle = getComputedStyle(document.documentElement)
    const accent = computedStyle.getPropertyValue('--color-accent').trim()
    let r = 99,
      g = 102,
      b = 241

    const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(accent)
    if (hexMatch) {
      r = parseInt(hexMatch[1], 16)
      g = parseInt(hexMatch[2], 16)
      b = parseInt(hexMatch[3], 16)
    } else {
      const rgbMatch = /(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(accent)
      if (rgbMatch) {
        r = parseInt(rgbMatch[1], 10)
        g = parseInt(rgbMatch[2], 10)
        b = parseInt(rgbMatch[3], 10)
      }
    }

    function draw() {
      if (!canvas || !ctx || !container) return
      const w = container.getBoundingClientRect().width
      const h = container.getBoundingClientRect().height

      ctx.clearRect(0, 0, w, h)
      const dots = dotsRef.current

      if (!reduced) {
        for (const dot of dots) {
          dot.x += dot.vx
          dot.y += dot.vy
          if (dot.x < 0 || dot.x > w) dot.vx *= -1
          if (dot.y < 0 || dot.y > h) dot.vy *= -1
        }
      }

      // Draw connection lines
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x
          const dy = dots[i].y - dots[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECTION_DISTANCE) {
            const opacity = 0.12 * (1 - dist / CONNECTION_DISTANCE)
            ctx.strokeStyle = `rgba(${r},${g},${b},${opacity})`
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(dots[i].x, dots[i].y)
            ctx.lineTo(dots[j].x, dots[j].y)
            ctx.stroke()
          }
        }
      }

      // Draw dots
      for (const dot of dots) {
        ctx.fillStyle = `rgba(${r},${g},${b},0.55)`
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2)
        ctx.fill()
      }

      if (!reduced) {
        rafRef.current = requestAnimationFrame(draw)
      }
    }

    draw()

    const observer = new ResizeObserver(() => {
      if (!ctx) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      resize()
      if (reduced) draw()
    })
    observer.observe(container)

    return () => {
      cancelAnimationFrame(rafRef.current)
      observer.disconnect()
    }
  }, [reduced])

  return (
    <div
      ref={containerRef}
      className="relative min-h-[400px] flex items-center justify-center"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <canvas ref={canvasRef} className="absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 flex flex-col items-center gap-2">
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">{label}</span>
        <span className="text-xs text-[var(--color-text-dim)]">Connecting to cluster</span>
      </div>
    </div>
  )
}
