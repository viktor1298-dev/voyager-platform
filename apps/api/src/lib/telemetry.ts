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

let sdk: NodeSDK | null = null

if (OTEL_ENDPOINT) {
  try {
    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'voyager-api',
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
        [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
        [SEMRESATTRS_K8S_NAMESPACE_NAME]: process.env.K8S_NAMESPACE ?? 'default',
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${OTEL_ENDPOINT}/v1/traces`,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-pg': { enabled: true },
          '@opentelemetry/instrumentation-ioredis': { enabled: true },
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    })
    sdk.start()
    console.log('[telemetry] OpenTelemetry SDK started')
  } catch (err) {
    console.warn('[telemetry] Failed to start OpenTelemetry SDK:', err)
    sdk = null
  }
} else {
  console.log('[telemetry] OTEL_EXPORTER_OTLP_ENDPOINT not set — telemetry disabled')
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
  }
}
