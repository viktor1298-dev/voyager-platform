import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

const sdk = new NodeSDK({
  resource: new Resource({
    'service.name': 'voyager-api',
    'service.version': process.env.npm_package_version ?? '0.0.0',
    'deployment.environment.name': process.env.NODE_ENV ?? 'development',
    'k8s.namespace.name': process.env.K8S_NAMESPACE ?? 'default',
  }),
  ...(OTEL_ENDPOINT
    ? { traceExporter: new OTLPTraceExporter({ url: `${OTEL_ENDPOINT}/v1/traces` }) }
    : {}),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    }),
  ],
})

sdk.start()

export async function shutdownTelemetry(): Promise<void> {
  await sdk.shutdown()
}
