import { describe, expect, it } from 'vitest';
import { EnvHealthIndicator } from './env-health.indicator';

describe('EnvHealthIndicator', () => {
  it('skips when no variables are configured', () => {
    expect(new EnvHealthIndicator().check()).toEqual({
      name: 'env',
      status: 'skipped',
      required: false,
      details: { reason: 'no env variables configured' },
    });
  });

  it('reports presence counts and missing keys without exposing values', () => {
    expect(
      new EnvHealthIndicator({
        env: { PRESENT: 'value', OPTIONAL: '' },
        requiredVariables: ['PRESENT', 'MISSING'],
        optionalVariables: ['OPTIONAL'],
      }).check(),
    ).toEqual({
      name: 'env',
      status: 'error',
      required: true,
      details: {
        requiredConfigured: 1,
        requiredTotal: 2,
        optionalConfigured: 0,
        optionalTotal: 1,
        missingRequired: ['MISSING'],
        missingOptional: ['OPTIONAL'],
      },
    });
  });

  it('degrades when only optional variables are missing', () => {
    expect(
      new EnvHealthIndicator({
        name: 'config',
        env: { REQUIRED: 'value' },
        requiredVariables: ['REQUIRED'],
        optionalVariables: ['OPTIONAL'],
      }).check(),
    ).toEqual({
      name: 'config',
      status: 'degraded',
      required: true,
      details: {
        requiredConfigured: 1,
        requiredTotal: 1,
        optionalConfigured: 0,
        optionalTotal: 1,
        missingRequired: [],
        missingOptional: ['OPTIONAL'],
      },
    });
  });

  it('reports ok when every configured variable is present', () => {
    expect(
      new EnvHealthIndicator({
        required: false,
        env: { REQUIRED: 'value', OPTIONAL: '  present  ' },
        requiredVariables: ['REQUIRED'],
        optionalVariables: ['OPTIONAL'],
      }).check(),
    ).toEqual({
      name: 'env',
      status: 'ok',
      required: false,
      details: {
        requiredConfigured: 1,
        requiredTotal: 1,
        optionalConfigured: 1,
        optionalTotal: 1,
        missingRequired: [],
        missingOptional: [],
      },
    });
  });
});
