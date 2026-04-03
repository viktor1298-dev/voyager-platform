import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_K8S_NAMESPACE_NAME,
} from '@opentelemetry/semantic-conventions'
import { createComponentLogger } from './logger.js'

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

let sdk: NodeSDK | null = null

// Telemetry initializes before Fastify boots, so use a lazy logger
function log() {
  try {
    return createComponentLogger('telemetry')
  } catch {
    // Logger not yet initialized — fall back to console for early boot
    return { info: console.log, warn: console.warn, error: console.error } as never
  }
}

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
        new PinoInstrumentation({ enabled: true }),
      ],
    })
    sdk.start()
    log().info({ endpoint: OTEL_ENDPOINT }, 'OpenTelemetry SDK started')
  } catch (err) {
    log().warn({ err }, 'Failed to start OpenTelemetry SDK')
    sdk = null
  }
} else {
  log().info('OTEL_EXPORTER_OTLP_ENDPOINT not set — telemetry disabled')
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
  }
}
