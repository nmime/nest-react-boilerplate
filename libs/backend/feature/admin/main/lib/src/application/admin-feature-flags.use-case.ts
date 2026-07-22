import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import type { FeatureFlagValue } from '@app/common-feature-flags';
import { AdminAuditLogRepository } from '@app/backend-postgres-main-auth';
import { FeatureFlagRepository, type FeatureFlagEntity } from '@app/backend-postgres-main-feature-flags';
import { AdminApplicationError } from './admin-errors';
import { resolveTenantId, unwrapRepositoryResult } from './util';
import type { AdminRequestContext } from '../domain';

export interface AdminFeatureFlagView {
  createdAt: string;
  description: string;
  enabled: boolean;
  id: string;
  key: string;
  updatedAt: string;
  value: FeatureFlagValue;
}

export interface UpsertAdminFeatureFlagCommand {
  description?: string;
  enabled?: boolean;
  value: unknown;
}

const isFeatureFlagValue = (value: unknown): value is FeatureFlagValue =>
  typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
const featureFlagKeyPattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/u;

const toView = (entity: FeatureFlagEntity): AdminFeatureFlagView => ({
  createdAt: entity.createdAt.toISOString(),
  description: entity.description,
  enabled: entity.enabled,
  id: entity.id,
  key: entity.key,
  updatedAt: entity.updatedAt.toISOString(),
  value: entity.value,
});

export class AdminFeatureFlagsUseCase {
  constructor(
    private readonly featureFlags: FeatureFlagRepository,
    private readonly auditLogs: AdminAuditLogRepository,
  ) {}

  async list(principal: AuthenticatedPrincipal): Promise<{ items: AdminFeatureFlagView[] }> {
    const tenantId = resolveTenantId(principal);
    const flags = unwrapRepositoryResult<FeatureFlagEntity[]>(await this.featureFlags.list({ tenantId }));
    return { items: flags.map(toView) };
  }

  async upsert(
    principal: AuthenticatedPrincipal,
    key: string,
    input: UpsertAdminFeatureFlagCommand,
    context: AdminRequestContext = {},
  ): Promise<AdminFeatureFlagView> {
    if (key.length > 160 || !featureFlagKeyPattern.test(key)) {
      throw new AdminApplicationError('invalid_access_policy', 'Feature flag keys must use dotted lowercase words.');
    }
    const value = input.value;
    if (!isFeatureFlagValue(value)) {
      throw new AdminApplicationError(
        'invalid_access_policy',
        'Feature flag values must be boolean, number, or string.',
      );
    }
    const tenantId = resolveTenantId(principal);

    const result = await this.auditLogs.recordTransactionally({
      operation: async (entityManager) => {
        const beforeEntity = unwrapRepositoryResult<FeatureFlagEntity | null>(
          await this.featureFlags.findByKey(key, tenantId, entityManager),
        );
        const before = beforeEntity ? toView(beforeEntity) : undefined;
        const afterEntity = unwrapRepositoryResult<FeatureFlagEntity>(
          await this.featureFlags.upsert(
            {
              tenantId,
              key,
              value,
              ...(input.description !== undefined ? { description: input.description.trim() } : {}),
              ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            },
            entityManager,
          ),
        );
        return { before, after: toView(afterEntity) };
      },
      audit: ({ after, before }) => ({
        tenantId,
        actorUserId: principal.subject,
        action: 'admin.feature_flag.upsert',
        resource: 'admin.feature-flags',
        targetUserId: after.id,
        before: before ? { ...before } : {},
        after: { ...after },
        metadata: { ...context, featureFlagKey: key },
      }),
    });

    return result.after;
  }
}
