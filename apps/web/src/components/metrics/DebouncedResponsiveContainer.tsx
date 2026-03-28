'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

interface DebouncedResponsiveContainerProps {
  width?: string | number
  height: number
  debounceMs?: number
  children: (dimensions: { width: number; height: number }) => React.ReactNode
  className?: string
}

/**
 * A debounced responsive container that prevents layout thrashing during
 * window resizes. Instead of firing on every pixel change (like Recharts'
 * ResponsiveContainer), this component debounces resize observations and
 * only re-renders children after the resize settles.
 *
 * Uses ResizeObserver for efficient DOM observation without polling.
 */
export function DebouncedResponsiveContainer({
  width = '100%',
  height,
  debounceMs = 150,
  children,
  className,
}: DebouncedResponsiveContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height,
  })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleResize = useCallback(
    (entries: ResizeObserverEntry[]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        const entry = entries[0]
        if (entry) {
          const { width: newWidth } = entry.contentRect
          setDimensions((prev) => {
            // Only update if width actually changed (height is fixed)
            if (Math.abs(prev.width - newWidth) < 1) return prev
            return { width: newWidth, height }
          })
        }
      }, debounceMs)
    },
    [debounceMs, height],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Set initial dimensions
    const rect = el.getBoundingClientRect()
    setDimensions({ width: rect.width, height })

    const observer = new ResizeObserver(handleResize)
    observer.observe(el)

    return () => {
      observer.disconnect()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [handleResize, height])

  return (
    <div ref={containerRef} className={className} style={{ width, height, position: 'relative' }}>
      {dimensions.width > 0 ? children(dimensions) : null}
    </div>
  )
}
