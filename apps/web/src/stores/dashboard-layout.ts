'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Use a simple record type to avoid react-grid-layout generic complexity
type LayoutItem = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number }
type ResponsiveLayouts = Record<string, LayoutItem[]>

export type WidgetType =
  | 'stat-cards'
  | 'cluster-health'
  | 'resource-charts'
  | 'alert-feed'
  | 'anomaly-timeline'
  | 'deployment-list'
  | 'log-tail'
  | 'pod-status'

export interface Widget {
  id: string
  type: WidgetType
  config?: Record<string, unknown>
}

export interface WidgetMeta {
  type: WidgetType
  title: string
  description: string
  icon: string
  defaultSize: { w: number; h: number; minW?: number; minH?: number }
}

export const WIDGET_REGISTRY: Record<WidgetType, WidgetMeta> = {
  'stat-cards': {
    type: 'stat-cards',
    title: 'Stat Cards',
    description: 'Key metrics: nodes, pods, clusters, warnings',
    icon: '📊',
    defaultSize: { w: 12, h: 2, minW: 6, minH: 2 },
  },
  'cluster-health': {
    type: 'cluster-health',
    title: 'Cluster Health',
    description: 'Health matrix and resource utilization gauges',
    icon: '🖥️',
    defaultSize: { w: 12, h: 5, minW: 6, minH: 3 },
  },
  'resource-charts': {
    type: 'resource-charts',
    title: 'Resource Charts',
    description: 'CPU/Memory time-series charts',
    icon: '📈',
    defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
  },
  'alert-feed': {
    type: 'alert-feed',
    title: 'Alert Feed',
    description: 'Live alert notifications',
    icon: '🔔',
    defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
  },
  'anomaly-timeline': {
    type: 'anomaly-timeline',
    title: 'Anomaly Timeline',
    description: 'Anomaly detection timeline (24h)',
    icon: '⚡',
    defaultSize: { w: 12, h: 3, minW: 6, minH: 2 },
  },
  'deployment-list': {
    type: 'deployment-list',
    title: 'Deployments',
    description: 'Recent deployment activity',
    icon: '🚀',
    defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
  },
  'log-tail': {
    type: 'log-tail',
    title: 'Log Tail',
    description: 'Live log stream from cluster',
    icon: '📋',
    defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
  },
  'pod-status': {
    type: 'pod-status',
    title: 'Pod Status',
    description: 'Pod health overview',
    icon: '🫛',
    defaultSize: { w: 6, h: 3, minW: 4, minH: 2 },
  },
}

function makeDefaultWidgets(): Widget[] {
  return [
    { id: 'w-stat-cards', type: 'stat-cards' },
    { id: 'w-cluster-health', type: 'cluster-health' },
    { id: 'w-anomaly-timeline', type: 'anomaly-timeline' },
  ]
}

function makeDefaultLayouts(): ResponsiveLayouts {
  return {
    lg: [
      { i: 'w-stat-cards', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2 },
      { i: 'w-cluster-health', x: 0, y: 2, w: 12, h: 5, minW: 6, minH: 3 },
      { i: 'w-anomaly-timeline', x: 0, y: 7, w: 12, h: 3, minW: 6, minH: 2 },
    ],
    md: [
      { i: 'w-stat-cards', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2 },
      { i: 'w-cluster-health', x: 0, y: 2, w: 12, h: 5, minW: 6, minH: 3 },
      { i: 'w-anomaly-timeline', x: 0, y: 7, w: 12, h: 3, minW: 6, minH: 2 },
    ],
    sm: [
      { i: 'w-stat-cards', x: 0, y: 0, w: 6, h: 2, minW: 3, minH: 2 },
      { i: 'w-cluster-health', x: 0, y: 2, w: 6, h: 5, minW: 3, minH: 3 },
      { i: 'w-anomaly-timeline', x: 0, y: 7, w: 6, h: 3, minW: 3, minH: 2 },
    ],
    xs: [
      { i: 'w-stat-cards', x: 0, y: 0, w: 1, h: 3 },
      { i: 'w-cluster-health', x: 0, y: 3, w: 1, h: 6 },
      { i: 'w-anomaly-timeline', x: 0, y: 9, w: 1, h: 4 },
    ],
  }
}

interface DashboardLayoutState {
  widgets: Widget[]
  layouts: ResponsiveLayouts
  editMode: boolean
  setEditMode: (on: boolean) => void
  addWidget: (type: WidgetType) => void
  removeWidget: (id: string) => void
  updateWidgetConfig: (id: string, config: Record<string, unknown>) => void
  updateLayouts: (layouts: ResponsiveLayouts) => void
  resetToDefault: () => void
  getLayoutForServer: () => { widgets: Widget[]; layouts: ResponsiveLayouts }
  applyServerLayout: (data: { widgets: unknown[]; layouts: Record<string, unknown[]> }) => void
}

let widgetCounter = 0

export const useDashboardLayout = create<DashboardLayoutState>()(
  persist(
    (set, get) => ({
      widgets: makeDefaultWidgets(),
      layouts: makeDefaultLayouts(),
      editMode: false,

      setEditMode: (on) => set({ editMode: on }),

      addWidget: (type) => {
        const id = `w-${type}-${++widgetCounter}`
        const meta = WIDGET_REGISTRY[type]
        const widget: Widget = { id, type }
        const { w, h, minW, minH } = meta.defaultSize

        set((s) => {
          const newLayouts: ResponsiveLayouts = {}
          for (const bp of Object.keys(s.layouts)) {
            const existing = s.layouts[bp] ?? []
            const maxY = existing.reduce((m: number, l: LayoutItem) => Math.max(m, l.y + l.h), 0)
            newLayouts[bp] = [...existing, { i: id, x: 0, y: maxY, w, h, minW, minH }]
          }
          return { widgets: [...s.widgets, widget], layouts: newLayouts }
        })
      },

      removeWidget: (id) => {
        set((s) => {
          const newLayouts: ResponsiveLayouts = {}
          for (const bp of Object.keys(s.layouts)) {
            newLayouts[bp] = (s.layouts[bp] ?? []).filter((l: LayoutItem) => l.i !== id)
          }
          return { widgets: s.widgets.filter((w) => w.id !== id), layouts: newLayouts }
        })
      },

      updateWidgetConfig: (id, config) => {
        set((s) => ({
          widgets: s.widgets.map((w) => (w.id === id ? { ...w, config } : w)),
        }))
      },

      updateLayouts: (layouts) => set({ layouts }),

      resetToDefault: () => set({ widgets: makeDefaultWidgets(), layouts: makeDefaultLayouts() }),

      getLayoutForServer: () => {
        const { widgets, layouts } = get()
        return { widgets, layouts }
      },

      applyServerLayout: (data) => {
        set({
          widgets: data.widgets as Widget[],
          layouts: data.layouts as ResponsiveLayouts,
        })
      },
    }),
    {
      name: 'dashboard-layout-v1',
      partialize: (s) => ({ widgets: s.widgets, layouts: s.layouts }),
    },
  ),
)
