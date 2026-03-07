import { Activity, Bell, FileText, LayoutDashboard, Server, Settings } from 'lucide-react'

export type NavItem = {
  id: string
  label: string
  icon: typeof LayoutDashboard
  badge?: number
}

export const navItems: NavItem[] = [
  { id: '/', label: 'Dashboard', icon: LayoutDashboard },
  { id: '/clusters', label: 'Clusters', icon: Server },
  { id: '/alerts', label: 'Alerts', icon: Bell },
  { id: '/events', label: 'Events', icon: Activity },
  { id: '/logs', label: 'Logs', icon: FileText },
  { id: '/settings', label: 'Settings', icon: Settings },
] as const
