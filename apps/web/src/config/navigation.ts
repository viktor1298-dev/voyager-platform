import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  Box,
  ClipboardList,
  Eye,
  FileText,
  Flag,
  FolderTree,
  HeartPulse,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  Server,
  Settings,
  Shield,
  Users,
  UsersRound,
  Webhook,
  Wind,
} from 'lucide-react'

type NavItem = {
  id: string
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
  section?: 'access-control' | 'autoscaling'
  group?: 'observability' | 'infrastructure' | 'platform' | 'admin'
}

export const navItems: NavItem[] = [
  // Observability
  { id: '/', label: 'Dashboard', icon: LayoutDashboard, group: 'observability' },
  { id: '/system-health', label: 'Health', icon: HeartPulse, group: 'observability' },
  { id: '/anomalies', label: 'Anomalies', icon: AlertTriangle, group: 'observability' },
  { id: '/events', label: 'Events', icon: Activity, group: 'observability' },
  { id: '/alerts', label: 'Alerts', icon: Bell, group: 'observability' },
  // Infrastructure
  { id: '/clusters', label: 'Clusters', icon: Server, group: 'infrastructure' },
  { id: '/services', label: 'Services', icon: Layers, group: 'infrastructure' },
  { id: '/deployments', label: 'Deployments', icon: Box, group: 'infrastructure' },
  { id: '/namespaces', label: 'Namespaces', icon: FolderTree, group: 'infrastructure' },
  { id: '/logs', label: 'Logs', icon: FileText, group: 'infrastructure' },
  // Platform
  { id: '/ai', label: 'AI Assistant', icon: Bot, group: 'platform' },
  { id: '/webhooks', label: 'Webhooks', icon: Webhook, adminOnly: true, group: 'platform' },
  { id: '/karpenter', label: 'Autoscaling', icon: Wind, group: 'platform', section: 'autoscaling' },
  // Admin
  { id: '/settings', label: 'Settings', icon: Settings, group: 'admin' },
  { id: '/features', label: 'Feature Flags', icon: Flag, adminOnly: true, group: 'admin' },
  {
    id: '/teams',
    label: 'Teams',
    icon: UsersRound,
    adminOnly: true,
    section: 'access-control',
    group: 'admin',
  },
  {
    id: '/permissions',
    label: 'Permissions',
    icon: Shield,
    adminOnly: true,
    section: 'access-control',
    group: 'admin',
  },
  { id: '/users', label: 'Users', icon: Users, adminOnly: true, group: 'admin' },
  { id: '/audit', label: 'Audit Log', icon: ClipboardList, adminOnly: true, group: 'admin' },
  { id: '/dashboards', label: 'Shared Dashboards', icon: LayoutGrid, group: 'observability' },
] as const

export interface NavGroup {
  key: string
  label: string
  emoji: string
  icon: typeof LayoutDashboard
  items: NavItem[]
}

export function getNavGroups(items: NavItem[]): NavGroup[] {
  const groups: NavGroup[] = [
    { key: 'observability', label: 'Observability', emoji: '👁️', icon: Eye, items: [] },
    { key: 'infrastructure', label: 'Infrastructure', emoji: '⚙️', icon: Server, items: [] },
    { key: 'platform', label: 'Platform', emoji: '🤖', icon: Bot, items: [] },
    { key: 'admin', label: 'Admin', emoji: '🔐', icon: Lock, items: [] },
  ]

  const groupMap = new Map(groups.map((g) => [g.key, g]))

  for (const item of items) {
    const group = groupMap.get(item.group ?? 'admin')
    if (group) group.items.push(item)
  }

  return groups.filter((g) => g.items.length > 0)
}
