// @requirements REQ-NOTIFY-PREFERENCE-006
import { describe, expect, it } from 'vitest';
import { DefaultFeatureFlagTenantId } from '@app/common-feature-flags';
import { FeatureFlagEntity, FeatureFlagEntitySchema } from './feature-flag.entity';

const invokeLifecycleHook = (hook: unknown): unknown => (hook as (() => unknown) | undefined)?.();

describe('FeatureFlagEntity', () => {
  it('defaults feature flags to the shared tenant and enabled DB-backed values', () => {
    const entity = new FeatureFlagEntity({
      key: 'billing.portal',
      value: true,
    });

    expect(entity).toMatchObject({
      tenantId: DefaultFeatureFlagTenantId,
      key: 'billing.portal',
      value: true,
      description: '',
      enabled: true,
    });
  });

  it('defaults optional fields when no input is provided', () => {
    const entity = new FeatureFlagEntity();

    expect(entity).toMatchObject({
      tenantId: DefaultFeatureFlagTenantId,
      value: false,
      description: '',
      enabled: true,
    });
    expect(entity.id).toMatch(/[0-9a-f-]{36}/);
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.updatedAt).toBeInstanceOf(Date);
  });

  it('preserves explicitly supplied optional fields', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-02-01T00:00:00.000Z');
    const entity = new FeatureFlagEntity({
      tenantId: '00000000-0000-4000-8000-000000000001',
      key: 'billing.portal',
      value: 'on',
      description: 'Billing UI',
      enabled: false,
      createdAt,
      updatedAt,
    });

    expect(entity).toMatchObject({
      tenantId: '00000000-0000-4000-8000-000000000001',
      key: 'billing.portal',
      value: 'on',
      description: 'Billing UI',
      enabled: false,
      createdAt,
      updatedAt,
    });
  });

  it('maps to the persistent feature_flags table schema', () => {
    expect(FeatureFlagEntitySchema.meta.tableName).toBe('feature_flags');
    expect(FeatureFlagEntitySchema.meta.uniques).toContainEqual({
      name: 'uq__feature_flags__tenant_id_key',
      properties: ['tenantId', 'key'],
    });
    expect(FeatureFlagEntitySchema.meta.checks).toContainEqual({
      name: 'ck__feature_flags__key',
      expression: '"key" ~ \'^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)*$\'',
    });
  });

  it('defines timestamp lifecycle hooks', () => {
    FeatureFlagEntitySchema.init();

    expect(invokeLifecycleHook(FeatureFlagEntitySchema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeLifecycleHook(FeatureFlagEntitySchema.meta.properties.updatedAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeLifecycleHook(FeatureFlagEntitySchema.meta.properties.updatedAt.onUpdate)).toBeInstanceOf(Date);
  });
});
