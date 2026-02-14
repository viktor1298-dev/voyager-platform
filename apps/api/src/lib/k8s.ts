import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'

let _kc: k8s.KubeConfig | null = null
let _k8sDisabled = false

export function getKubeConfig(): k8s.KubeConfig {
  if (!_kc) {
    _kc = new k8s.KubeConfig()
    try {
      _kc.loadFromDefault()
    } catch (e) {
      _k8sDisabled = true
      console.warn('No kubeconfig found, K8s features disabled')
    }
  }
  return _kc
}

function ensureK8sEnabled(): void {
  if (_k8sDisabled) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'K8s not configured' })
  }
}

export function getCoreV1Api(): k8s.CoreV1Api {
  ensureK8sEnabled()
  return getKubeConfig().makeApiClient(k8s.CoreV1Api)
}

export function getAppsV1Api(): k8s.AppsV1Api {
  ensureK8sEnabled()
  return getKubeConfig().makeApiClient(k8s.AppsV1Api)
}

export function getEventsApi(): k8s.EventsV1Api {
  ensureK8sEnabled()
  return getKubeConfig().makeApiClient(k8s.EventsV1Api)
}

export function getVersionApi(): k8s.VersionApi {
  ensureK8sEnabled()
  return getKubeConfig().makeApiClient(k8s.VersionApi)
}

export async function getClusterInfo() {
  const versionApi = getVersionApi()
  const version = await versionApi.getCode()
  return {
    version: `v${version.major}.${version.minor}`,
    platform: version.platform,
  }
}
