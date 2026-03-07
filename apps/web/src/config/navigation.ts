import { Bell, Bot, LayoutDashboard, LayoutGrid, Server, Settings } from 'lucide-react'

export type NavItem = {
  id: string
  label: string
  icon: typeof LayoutDashboard
}

export const navItems: NavItem[] = [
  { id: '/', label: 'Dashboard', icon: LayoutDashboard },
  { id: '/clusters', label: 'Clusters', icon: Server },
  { id: '/alerts', label: 'Alerts', icon: Bell },
  { id: '/ai', label: 'AI Assistant', icon: Bot },
  { id: '/dashboards', label: 'Dashboards', icon: LayoutGrid },
  { id: '/settings', label: 'Settings', icon: Settings },
] as const
