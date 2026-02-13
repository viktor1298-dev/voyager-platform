import * as k8s from '@kubernetes/client-node'

const kc = new k8s.KubeConfig()
kc.loadFromDefault()

export const coreV1Api = kc.makeApiClient(k8s.CoreV1Api)
export const appsV1Api = kc.makeApiClient(k8s.AppsV1Api)
export const eventsApi = kc.makeApiClient(k8s.EventsV1Api)
export const versionApi = kc.makeApiClient(k8s.VersionApi)

export async function getClusterInfo() {
  const version = await versionApi.getCode()
  return {
    version: `v${version.major}.${version.minor}`,
    platform: version.platform,
  }
}
