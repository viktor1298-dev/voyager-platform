/** K8s client pool and connection settings */

export const K8S_CONFIG = {
  CLIENT_POOL_MAX: 50,
  get ENCRYPTION_KEY() {
    return process.env.CLUSTER_CRED_ENCRYPTION_KEY ?? ''
  },
} as const
