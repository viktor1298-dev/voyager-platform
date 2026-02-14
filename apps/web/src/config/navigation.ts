import { Activity, Box, LayoutDashboard, Server, Settings } from 'lucide-react'

export const navItems = [
  { id: '/', label: 'Dashboard', icon: LayoutDashboard },
  { id: '/clusters', label: 'Clusters', icon: Server },
  { id: '/deployments', label: 'Deployments', icon: Box },
  { id: '/events', label: 'Events', icon: Activity },
  { id: '/settings', label: 'Settings', icon: Settings },
] as const
