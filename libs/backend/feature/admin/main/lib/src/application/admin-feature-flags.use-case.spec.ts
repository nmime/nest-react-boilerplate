// @requirements REQ-AUTH-TENANT-004
import { okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { AdminApplicationError } from './admin-errors';
import { type AdminFeatureFlagRecord, AdminFeatureFlagsUseCase } from './admin-feature-flags.use-case';

const principal = {
  subject: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000000',
  roles: ['admin'],
  permissions: ['admin:feature-flags:read', 'admin:feature-flags:write'],
};

const createFixture = () => {
  const now = new Date('2026-07-26T00:00:00.000Z');
  const entity: AdminFeatureFlagRecord = {
    id: '00000000-0000-4000-8000-000000000010',
    tenantId: principal.tenantId,
    key: 'checkout.newflow',
    value: true,
    description: 'New checkout',
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  const featureFlags = {
    list: vi.fn(() => okAsync([entity])),
    findByKey: vi.fn(() => okAsync<AdminFeatureFlagRecord | null>(null)),
    upsert: vi.fn(() => okAsync(entity)),
  };
  const auditLogs = {
    recordTransactionally: vi.fn(async (input) => {
      const result = await input.operation({} as never);
      input.audit(result);
      return result;
    }),
  };

  return {
    auditLogs,
    entity,
    featureFlags,
    useCase: new AdminFeatureFlagsUseCase(featureFlags as never, auditLogs as never),
  };
};

describe('AdminFeatureFlagsUseCase', () => {
  it('lists flags in the authenticated tenant', async () => {
    const fixture = createFixture();

    await expect(fixture.useCase.list(principal)).resolves.toEqual({
      items: [
        expect.objectContaining({
          key: 'checkout.newflow',
          value: true,
        }),
      ],
    });
    expect(fixture.featureFlags.list).toHaveBeenCalledWith({ tenantId: principal.tenantId });
  });

  it('rejects unsupported JSON values before persistence', async () => {
    const fixture = createFixture();

    await expect(
      fixture.useCase.upsert(principal, 'checkout.newflow', { value: { percentage: 10 } }),
    ).rejects.toBeInstanceOf(AdminApplicationError);
    expect(fixture.auditLogs.recordTransactionally).not.toHaveBeenCalled();
  });

  it('writes the flag, audit log, and outbox in one transaction', async () => {
    const fixture = createFixture();

    await expect(
      fixture.useCase.upsert(
        principal,
        'checkout.newflow',
        { description: '  New checkout  ', enabled: true, value: true },
        { requestId: 'request-1' },
      ),
    ).resolves.toEqual(expect.objectContaining({ key: 'checkout.newflow', value: true }));

    expect(fixture.featureFlags.upsert).toHaveBeenCalledWith(
      {
        tenantId: principal.tenantId,
        key: 'checkout.newflow',
        description: 'New checkout',
        enabled: true,
        value: true,
      },
      expect.anything(),
    );
    expect(fixture.auditLogs.recordTransactionally).toHaveBeenCalledOnce();
  });
});
