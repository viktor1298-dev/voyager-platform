'use client'

import { cn } from '@/lib/utils'
import * as React from 'react'

type TabsContextValue = {
  value: string
  onValueChange?: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within <Tabs>')
  }
  return context
}

type TabsProps = React.ComponentProps<'div'> & {
  value: string
  onValueChange?: (value: string) => void
}

function Tabs({ className, value, onValueChange, children, ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn('w-full', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-lg bg-[var(--color-bg-secondary)] p-1 text-[var(--color-text-muted)] border border-[var(--color-border)]',
        className,
      )}
      {...props}
    />
  )
}

type TabsTriggerProps = React.ComponentProps<'button'> & {
  value: string
}

function TabsTrigger({ className, value, onClick, ...props }: TabsTriggerProps) {
  const context = useTabsContext()
  const active = context.value === value

  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:pointer-events-none disabled:opacity-50',
        active
          ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
        className,
      )}
      data-state={active ? 'active' : 'inactive'}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented && !props.disabled) {
          context.onValueChange?.(value)
        }
      }}
      {...props}
    />
  )
}

type TabsContentProps = React.ComponentProps<'div'> & {
  value: string
}

function TabsContent({ className, value, ...props }: TabsContentProps) {
  const context = useTabsContext()
  if (context.value !== value) return null
  return <div className={cn('mt-4', className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
