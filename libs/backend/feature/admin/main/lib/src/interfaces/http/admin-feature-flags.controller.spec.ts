import { okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  CurrentUser,
  RequiredPermissionsMetadataKey,
  type AuthenticatedPrincipal,
} from '@app/backend-feature-auth-shared';
import { AdminFeatureFlagsReadPermission, AdminFeatureFlagsWritePermission } from '@app/backend-feature-admin-shared';
import { FeatureFlagEntity } from '@app/backend-postgres-main-feature-flags';
import { AdminFeatureFlagsUseCase } from '../../application';
import { AdminFeatureFlagsController } from './admin-feature-flags.controller';

const principal: AuthenticatedPrincipal = {
  subject: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000000',
  roles: ['operations'],
  permissions: [AdminFeatureFlagsReadPermission, AdminFeatureFlagsWritePermission],
};

const createController = () => {
  const entity = new FeatureFlagEntity({
    tenantId: principal.tenantId,
    key: 'checkout.newflow',
    value: true,
    description: 'New checkout',
  });
  const featureFlags = {
    list: vi.fn(() => okAsync([entity])),
    findByKey: vi.fn(() => okAsync(null)),
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
    controller: new AdminFeatureFlagsController(
      new AdminFeatureFlagsUseCase(featureFlags as never, auditLogs as never),
    ),
  };
};

describe('AdminFeatureFlagsController', () => {
  it('declares separate read and write permissions on its HTTP handlers', () => {
    expect(Reflect.getMetadata(RequiredPermissionsMetadataKey, AdminFeatureFlagsController.prototype.list)).toEqual([
      AdminFeatureFlagsReadPermission,
    ]);
    expect(Reflect.getMetadata(RequiredPermissionsMetadataKey, AdminFeatureFlagsController.prototype.upsert)).toEqual([
      AdminFeatureFlagsWritePermission,
    ]);
    expect(CurrentUser).toBeTypeOf('function');
  });

  it('returns tenant-scoped flags and transactionally audits writes', async () => {
    const { auditLogs, controller } = createController();

    await expect(controller.list(principal)).resolves.toMatchObject({
      data: { items: [expect.objectContaining({ key: 'checkout.newflow', value: true })] },
    });
    await expect(
      controller.upsert(
        principal,
        'checkout.newflow',
        { description: 'New checkout', enabled: true, value: true },
        { headers: { 'x-request-id': 'request-1' } },
      ),
    ).resolves.toMatchObject({ data: { key: 'checkout.newflow', value: true } });
    expect(auditLogs.recordTransactionally).toHaveBeenCalledOnce();
  });
});
