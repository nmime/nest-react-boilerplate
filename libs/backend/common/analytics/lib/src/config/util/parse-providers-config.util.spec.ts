// @requirements REQ-RUNTIME-OBSERVABILITY-005
import type Joi from 'joi';
import { describe, expect, it, vi } from 'vitest';
import { parseProvidersConfig } from './parse-providers-config.util';

function fakeHelpers(): {
  helpers: Joi.CustomHelpers;
  error: ReturnType<typeof vi.fn>;
} {
  const error = vi.fn((code: string) => `error:${code}`);
  return { helpers: { error } as unknown as Joi.CustomHelpers, error };
}

describe('parseProvidersConfig', () => {
  it('parses a trimmed, non-empty provider list', () => {
    const { helpers, error } = fakeHelpers();

    expect(parseProvidersConfig(' ga4 , posthog ,, umami,auto ', helpers)).toEqual(['ga4', 'posthog', 'umami', 'auto']);
    expect(error).not.toHaveBeenCalled();
  });

  it('reports an any.only error for an unknown provider', () => {
    const { helpers, error } = fakeHelpers();

    const result = parseProvidersConfig('ga4,unknown', helpers);

    expect(error).toHaveBeenCalledWith('any.only');
    expect(result).toBe('error:any.only');
  });
});
