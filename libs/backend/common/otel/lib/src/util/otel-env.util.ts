import type { OpenTelemetryEnvironment } from '../type/otel-environment.type';
import type { OpenTelemetryOptions } from '../type/otel-options.type';

export function isOpenTelemetryEnabled(
  options: Pick<OpenTelemetryOptions, 'enabled'>,
  env: OpenTelemetryEnvironment = process.env,
): boolean {
  if (parseBoolean(env.OTEL_SDK_DISABLED) === true) {
    return false;
  }
  if (typeof options.enabled === 'boolean') {
    return options.enabled;
  }

  const envEnabled = parseBoolean(env.OTEL_ENABLED);
  if (typeof envEnabled === 'boolean') {
    return envEnabled;
  }

  return Boolean(
    env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
    env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  );
}

export function resolveOtlpEndpoint(env: OpenTelemetryEnvironment, signal: 'traces' | 'metrics'): string | undefined {
  const signalEndpoint =
    signal === 'traces' ? env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT : env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
  if (signalEndpoint?.trim()) {
    return signalEndpoint.trim();
  }

  const baseEndpoint = trimTrailingSlashes(env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() ?? '');
  return baseEndpoint ? `${baseEndpoint}/v1/${signal}` : undefined;
}

export function readOtlpHeaders(env: OpenTelemetryEnvironment, signal: 'traces' | 'metrics'): Record<string, string> {
  const shared = parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS);
  const signalHeaders = parseOtlpHeaders(
    signal === 'traces' ? env.OTEL_EXPORTER_OTLP_TRACES_HEADERS : env.OTEL_EXPORTER_OTLP_METRICS_HEADERS,
  );
  return { ...shared, ...signalHeaders };
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return undefined;
  }
}

function parseOtlpHeaders(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex < 1) {
          return undefined;
        }
        const key = entry.slice(0, separatorIndex).trim();
        const headerValue = entry.slice(separatorIndex + 1).trim();
        /* v8 ignore next -- key is always non-empty here: entries are pre-trimmed and separatorIndex >= 1, so the slice before "=" always keeps a non-whitespace char. */
        return key ? [key, decodeHeaderValue(headerValue)] : undefined;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );
}

function decodeHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function trimTrailingSlashes(value: string): string {
  let endIndex = value.length;
  while (endIndex > 0 && value.charCodeAt(endIndex - 1) === 47) {
    endIndex -= 1;
  }
  return value.slice(0, endIndex);
}
