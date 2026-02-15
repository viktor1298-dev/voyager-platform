import { Activity, Bell, Box, ClipboardList, FileText, Flag, HeartPulse, LayoutDashboard, Server, Settings, Shield, Users, UsersRound, Webhook } from 'lucide-react'

type NavItem = {
  id: string
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
  section?: 'access-control'
}

export const navItems: NavItem[] = [
  { id: '/', label: 'Dashboard', icon: LayoutDashboard },
  { id: '/clusters', label: 'Clusters', icon: Server },
  { id: '/health', label: 'Health', icon: HeartPulse },
  { id: '/deployments', label: 'Deployments', icon: Box },
  { id: '/events', label: 'Events', icon: Activity },
  { id: '/alerts', label: 'Alerts', icon: Bell },
  { id: '/logs', label: 'Logs', icon: FileText },
  { id: '/features', label: 'Feature Flags', icon: Flag, adminOnly: true },
  { id: '/webhooks', label: 'Webhooks', icon: Webhook, adminOnly: true },
  { id: '/users', label: 'Users', icon: Users, adminOnly: true },
  { id: '/audit', label: 'Audit Log', icon: ClipboardList, adminOnly: true },
  { id: '/teams', label: 'Teams', icon: UsersRound, adminOnly: true, section: 'access-control' },
  { id: '/permissions', label: 'Permissions', icon: Shield, adminOnly: true, section: 'access-control' },
  { id: '/settings', label: 'Settings', icon: Settings },
] as const
