import type { ElementType } from 'react'
import {
  Activity,
  BarChart3,
  Box,
  FileText,
  HardDrive,
  LayoutDashboard,
  Network,
  Server,
  Settings,
  TrendingUp,
} from 'lucide-react'

export interface StandaloneTab {
  type: 'standalone'
  id: string
  label: string
  path: string
  icon: ElementType
}

export interface TabGroup {
  type: 'group'
  id: string
  label: string
  icon: ElementType
  children: { id: string; label: string; path: string }[]
}

export type ClusterTabEntry = StandaloneTab | TabGroup

export const CLUSTER_TAB_ENTRIES: ClusterTabEntry[] = [
  { type: 'standalone', id: 'overview', label: 'Overview', path: '', icon: LayoutDashboard },
  { type: 'standalone', id: 'nodes', label: 'Nodes', path: '/nodes', icon: Server },
  { type: 'standalone', id: 'events', label: 'Events', path: '/events', icon: Activity },
  { type: 'standalone', id: 'logs', label: 'Logs', path: '/logs', icon: FileText },
  { type: 'standalone', id: 'metrics', label: 'Metrics', path: '/metrics', icon: BarChart3 },
  {
    type: 'group',
    id: 'workloads',
    label: 'Workloads',
    icon: Box,
    children: [
      { id: 'pods', label: 'Pods', path: '/pods' },
      { id: 'deployments', label: 'Deployments', path: '/deployments' },
      { id: 'statefulsets', label: 'StatefulSets', path: '/statefulsets' },
      { id: 'daemonsets', label: 'DaemonSets', path: '/daemonsets' },
      { id: 'jobs', label: 'Jobs', path: '/jobs' },
      { id: 'cronjobs', label: 'CronJobs', path: '/cronjobs' },
    ],
  },
  {
    type: 'group',
    id: 'networking',
    label: 'Networking',
    icon: Network,
    children: [
      { id: 'services', label: 'Services', path: '/services' },
      { id: 'ingresses', label: 'Ingresses', path: '/ingresses' },
    ],
  },
  {
    type: 'group',
    id: 'config',
    label: 'Config',
    icon: Settings,
    children: [
      { id: 'configmaps', label: 'ConfigMaps', path: '/configmaps' },
      { id: 'secrets', label: 'Secrets', path: '/secrets' },
      { id: 'namespaces', label: 'Namespaces', path: '/namespaces' },
    ],
  },
  {
    type: 'group',
    id: 'storage',
    label: 'Storage',
    icon: HardDrive,
    children: [{ id: 'pvcs', label: 'PVCs', path: '/pvcs' }],
  },
  {
    type: 'group',
    id: 'scaling',
    label: 'Scaling',
    icon: TrendingUp,
    children: [
      { id: 'hpa', label: 'HPA', path: '/hpa' },
      { id: 'autoscaling', label: 'Karpenter', path: '/autoscaling' },
    ],
  },
]

/** Flat list of all tab paths (standalone + group children). */
export function getAllTabPaths(): { id: string; path: string }[] {
  const result: { id: string; path: string }[] = []
  for (const entry of CLUSTER_TAB_ENTRIES) {
    if (entry.type === 'standalone') {
      result.push({ id: entry.id, path: entry.path })
    } else {
      for (const child of entry.children) {
        result.push({ id: child.id, path: child.path })
      }
    }
  }
  return result
}

/** Find the group id that contains the given tab id, or null for standalone tabs. */
export function findGroupForTab(tabId: string): string | null {
  for (const entry of CLUSTER_TAB_ENTRIES) {
    if (entry.type === 'group' && entry.children.some((c) => c.id === tabId)) {
      return entry.id
    }
  }
  return null
}
