// @requirements REQ-NOTIFY-PREFERENCE-006
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EnvironmentFeatureFlagProvider,
  FeatureFlagProviderToken,
  InMemoryFeatureFlagProvider,
  createFeatureFlagProvider,
  parseFlagValue,
  readEnvironmentFlags,
  toFeatureFlagBoolean,
} from './index';

describe('feature flags', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('evaluates in-memory boolean-like values for tests and fallback adapters', () => {
    const provider = new InMemoryFeatureFlagProvider({
      'billing.portal': true,
      'admin.audit': 'off',
      'rollout.percent': 25,
    });

    expect(provider.isEnabled('billing.portal')).toBe(true);
    expect(provider.isEnabled('admin.audit')).toBe(false);
    expect(provider.getValue('rollout.percent', 0)).toBe(25);
    expect(provider.getValue('missing', 'fallback')).toBe('fallback');
    // Returns the fallback when the stored value's runtime type differs from it.
    expect(provider.getValue('rollout.percent', true)).toBe(true);
    expect(provider.getValue('admin.audit', 0)).toBe(0);
    expect(provider.getValue('billing.portal', false)).toBe(true);
    expect(createFeatureFlagProvider({ 'search.v2': 'on' }).isEnabled('search.v2')).toBe(true);
  });

  it('normalizes environment variable flags', () => {
    expect(
      readEnvironmentFlags({
        FEATURE_BILLING_PORTAL: 'true',
        FEATURE_ROLLOUT_PERCENT: '25',
        OTHER: 'ignored',
      }),
    ).toEqual({ 'billing.portal': true, 'rollout.percent': 25 });

    expect(
      new EnvironmentFeatureFlagProvider({
        FEATURE_ADMIN_AUDIT: 'yes',
      }).isEnabled('admin.audit'),
    ).toBe(true);
  });

  it('publishes a stable string injection token', () => {
    expect(FeatureFlagProviderToken).toBe('app.feature-flags.provider');
    expect(typeof FeatureFlagProviderToken).toBe('string');
  });

  it('treats numeric and absent flags as booleans', () => {
    const provider = new InMemoryFeatureFlagProvider({
      'rollout.percent': 25,
      'rollout.disabled': 0,
    });

    expect(provider.isEnabled('rollout.percent')).toBe(true);
    expect(provider.isEnabled('rollout.disabled')).toBe(false);
    // Unknown keys resolve to the disabled default branch.
    expect(provider.isEnabled('never.defined')).toBe(false);
  });

  it('coerces every supported value shape through toFeatureFlagBoolean', () => {
    expect(toFeatureFlagBoolean(true)).toBe(true);
    expect(toFeatureFlagBoolean(3)).toBe(true);
    expect(toFeatureFlagBoolean(0)).toBe(false);
    expect(toFeatureFlagBoolean('YES')).toBe(true);
    expect(toFeatureFlagBoolean('nope')).toBe(false);
    expect(toFeatureFlagBoolean(undefined)).toBe(false);
  });

  it('parses disabled, numeric, and free-form flag literals', () => {
    for (const off of ['0', 'false', 'no', 'off', ' OFF ']) {
      expect(parseFlagValue(off)).toBe(false);
    }

    expect(parseFlagValue('42')).toBe(42);
    expect(parseFlagValue('3.14')).toBeCloseTo(3.14, 10);
    // Non-numeric, non-boolean literals pass through unchanged.
    expect(parseFlagValue('canary')).toBe('canary');
    // Blank strings are not numbers and pass through verbatim.
    expect(parseFlagValue('   ')).toBe('   ');
  });

  it('normalizes disabled and free-form environment flags', () => {
    expect(
      readEnvironmentFlags({
        FEATURE_ADMIN_AUDIT: 'off',
        FEATURE_RELEASE_CHANNEL: 'canary',
        FEATURE_UNSET: undefined,
      }),
    ).toEqual({ 'admin.audit': false, 'release.channel': 'canary' });
  });

  it('exposes an isolated snapshot of the current flag values', () => {
    const provider = new InMemoryFeatureFlagProvider({
      'billing.portal': true,
    });
    const snapshot = provider.getSnapshot();

    expect(snapshot).toEqual({
      source: 'in-memory',
      values: { 'billing.portal': true },
    });

    (snapshot.values as Record<string, boolean>)['billing.portal'] = false;
    expect(provider.isEnabled('billing.portal')).toBe(true);
  });

  it('reads FEATURE_ variables from the ambient process environment by default', () => {
    vi.stubGlobal('process', {
      env: { FEATURE_DEFAULT_ENV: 'on', UNRELATED: 'skip' },
    });

    const provider = new EnvironmentFeatureFlagProvider();

    expect(provider.name).toBe('environment');
    expect(provider.isEnabled('default.env')).toBe(true);
    expect(provider.getSnapshot()).toEqual({
      source: 'environment',
      values: { 'default.env': true },
    });
  });

  it('falls back to an empty environment when no process is available', () => {
    vi.stubGlobal('process', undefined);

    const provider = new EnvironmentFeatureFlagProvider();

    expect(provider.getSnapshot().values).toEqual({});
  });
});
