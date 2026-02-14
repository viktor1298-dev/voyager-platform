// OpenTelemetry initialization — disabled until ESM compatibility is resolved
// The @opentelemetry packages don't export correctly under tsx + ESM in production
// TODO: Re-enable when using esbuild bundler or when OTel fixes ESM exports

export async function shutdownTelemetry(): Promise<void> {
  // no-op
}
