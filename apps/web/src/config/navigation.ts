import { Activity, Bell, Box, FileText, HeartPulse, LayoutDashboard, Server, Settings } from 'lucide-react'

export const navItems = [
  { id: '/', label: 'Dashboard', icon: LayoutDashboard },
  { id: '/clusters', label: 'Clusters', icon: Server },
  { id: '/health', label: 'Health', icon: HeartPulse },
  { id: '/deployments', label: 'Deployments', icon: Box },
  { id: '/events', label: 'Events', icon: Activity },
  { id: '/alerts', label: 'Alerts', icon: Bell },
  { id: '/logs', label: 'Logs', icon: FileText },
  { id: '/settings', label: 'Settings', icon: Settings },
] as const
