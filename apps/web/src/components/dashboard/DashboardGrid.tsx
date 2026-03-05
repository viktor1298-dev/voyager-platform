'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDashboardLayout, type Widget, type WidgetType } from '@/stores/dashboard-layout'
import { WidgetWrapper } from './WidgetWrapper'
import { StatCardsWidget } from './widgets/StatCardsWidget'
import { ClusterHealthWidget } from './widgets/ClusterHealthWidget'
import { AnomalyTimelineWidget } from './widgets/AnomalyTimelineWidget'
import { ResourceChartsWidget } from './widgets/ResourceChartsWidget'
import { AlertFeedWidget } from './widgets/AlertFeedWidget'
import { DeploymentListWidget } from './widgets/DeploymentListWidget'
import { LogTailWidget } from './widgets/LogTailWidget'
import { PodStatusWidget } from './widgets/PodStatusWidget'

type LayoutItem = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number }
type ResponsiveLayouts = Record<string, LayoutItem[]>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResponsiveGridLayout = React.ComponentType<any>

function renderWidget(widget: Widget) {
  switch (widget.type as WidgetType) {
    case 'stat-cards':
      return <StatCardsWidget />
    case 'cluster-health':
      return <ClusterHealthWidget />
    case 'anomaly-timeline':
      return <AnomalyTimelineWidget />
    case 'resource-charts':
      return <ResourceChartsWidget />
    case 'alert-feed':
      return <AlertFeedWidget />
    case 'deployment-list':
      return <DeploymentListWidget />
    case 'log-tail':
      return <LogTailWidget widget={widget} />
    case 'pod-status':
      return <PodStatusWidget />
    default:
      return (
        <div className="p-4 text-xs text-[var(--color-text-dim)]">
          Unknown widget: {widget.type}
        </div>
      )
  }
}

export function DashboardGrid() {
  const widgets = useDashboardLayout((s) => s.widgets)
  const layouts = useDashboardLayout((s) => s.layouts)
  const editMode = useDashboardLayout((s) => s.editMode)
  const updateLayouts = useDashboardLayout((s) => s.updateLayouts)
  const removeWidget = useDashboardLayout((s) => s.removeWidget)
  const updateWidgetConfig = useDashboardLayout((s) => s.updateWidgetConfig)

  const [GridComponent, setGridComponent] = useState<AnyResponsiveGridLayout | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    setContainerWidth(node.offsetWidth)
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    import('react-grid-layout').then((m) => {
      setGridComponent(() => m.Responsive)
      import('react-grid-layout/css/styles.css').catch(() => null)
    })
  }, [])

  const handleLayoutChange = useCallback(
    (_layout: LayoutItem[], allLayouts: ResponsiveLayouts) => {
      updateLayouts(allLayouts)
    },
    [updateLayouts],
  )

  return (
    <div ref={containerRef} data-testid="dashboard-grid" className="w-full">
      {GridComponent && containerWidth > 0 ? (
        <GridComponent
          className="layout"
          layouts={layouts}
          breakpoints={{ lg: 1280, md: 996, sm: 768, xs: 480 }}
          cols={{ lg: 12, md: 12, sm: 6, xs: 1 }}
          rowHeight={80}
          draggableHandle=".widget-drag-handle"
          isDraggable={editMode}
          isResizable={editMode}
          onLayoutChange={handleLayoutChange}
          margin={[12, 12]}
          containerPadding={[0, 0]}
          useCSSTransforms
          width={containerWidth}
        >
          {widgets.map((widget) => (
            <div key={widget.id}>
              <WidgetWrapper
                widget={widget}
                editMode={editMode}
                onRemove={removeWidget}
                onConfigSave={updateWidgetConfig}
              >
                {renderWidget(widget)}
              </WidgetWrapper>
            </div>
          ))}
        </GridComponent>
      ) : (
        <div className="space-y-3">
          {widgets.map((widget) => (
            <div
              key={widget.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] min-h-[160px]"
            >
              <WidgetWrapper
                widget={widget}
                editMode={false}
                onRemove={removeWidget}
                onConfigSave={updateWidgetConfig}
              >
                {renderWidget(widget)}
              </WidgetWrapper>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
