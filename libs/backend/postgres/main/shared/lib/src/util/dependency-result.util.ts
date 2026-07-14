import type { HealthIndicatorResult } from '@app/backend-common-health';
import type { PostgresDependencyHealthAdapter } from '../type';
import { redactDependencyDetail } from './redact-dependency-detail.util';

export function isConfigured(
  adapter: PostgresDependencyHealthAdapter | null | undefined,
): adapter is PostgresDependencyHealthAdapter {
  return adapter !== null && adapter !== undefined && adapter.configured !== false;
}

interface DependencyUnavailableResultOptions {
  name: string;
  mandatory: boolean;
  reason: 'not_configured' | 'unsupported';
  message: string;
}

export function dependencyUnavailableResult({
  name,
  mandatory,
  reason,
  message,
}: DependencyUnavailableResultOptions): HealthIndicatorResult {
  return {
    name,
    status: mandatory ? 'error' : 'ok',
    details: {
      skipped: !mandatory,
      reason,
      message,
    },
  };
}

export function dependencyError(name: string, error: unknown): HealthIndicatorResult {
  return {
    name,
    status: 'error',
    details: safeErrorDetails(error),
  };
}

function safeErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: redactDependencyDetail(error.message),
      type: error.name,
    };
  }

  return { message: redactDependencyDetail(String(error)) };
}
