import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_K8S_NAMESPACE_NAME,
} from '@opentelemetry/semantic-conventions'

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'voyager-api',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
    [SEMRESATTRS_K8S_NAMESPACE_NAME]: process.env.K8S_NAMESPACE ?? 'default',
  }),
  ...(OTEL_ENDPOINT
    ? {
        traceExporter: new OTLPTraceExporter({
          url: `${OTEL_ENDPOINT}/v1/traces`,
        }),
      }
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
