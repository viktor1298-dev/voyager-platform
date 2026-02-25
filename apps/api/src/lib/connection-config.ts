import { z } from 'zod'

export const kubeconfigConnectionConfigSchema = z
  .object({
    kubeconfig: z.string().min(1),
    context: z.string().optional(),
  })
  .passthrough()

export const awsConnectionConfigSchema = z
  .object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    sessionToken: z.string().optional(),
    clusterName: z.string().min(1),
    region: z.string().min(1),
    roleArn: z.string().optional(),
    endpoint: z.string().url().optional(),
    caCert: z.string().optional(),
  })
  .passthrough()

export const azureConnectionConfigSchema = z
  .object({
    subscriptionId: z.string().min(1),
    resourceGroup: z.string().min(1),
    clusterName: z.string().min(1),
    tenantId: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
  })
  .passthrough()

export const gkeConnectionConfigSchema = z
  .object({
    serviceAccountJson: z.string().min(1),
    endpoint: z.string().url().optional(),
    caCert: z.string().optional(),
  })
  .passthrough()

export const minikubeConnectionConfigSchema = z
  .object({
    context: z.string().optional(),
    caCert: z.string().optional(),
    clientCert: z.string().optional(),
    clientKey: z.string().optional(),
    endpoint: z.string().optional(),
  })
  .passthrough()

export const connectionConfigSchema = z.union([
  kubeconfigConnectionConfigSchema,
  awsConnectionConfigSchema,
  azureConnectionConfigSchema,
  gkeConnectionConfigSchema,
  minikubeConnectionConfigSchema,
])

export type KubeconfigConnectionConfig = z.infer<typeof kubeconfigConnectionConfigSchema>
export type AwsConnectionConfig = z.infer<typeof awsConnectionConfigSchema>
export type AzureConnectionConfig = z.infer<typeof azureConnectionConfigSchema>
export type GkeConnectionConfig = z.infer<typeof gkeConnectionConfigSchema>
export type MinikubeConnectionConfig = z.infer<typeof minikubeConnectionConfigSchema>
export type ClusterConnectionConfig = z.infer<typeof connectionConfigSchema>
