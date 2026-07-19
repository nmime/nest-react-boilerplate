import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { ProblemPresentationRepository, type ProblemPresentationEntity } from '@app/backend-postgres-main-auth';
import type {
  AdminProblemPresentationCatalog,
  AdminProblemPresentationView,
  AdminRequestContext,
  ResetAdminProblemPresentationCommand,
  ResetAdminProblemPresentationResult,
  UpdateAdminProblemPresentationCommand,
} from '../domain';
import { AdminApplicationError } from './admin-errors';
import { resolveTenantId, unwrapRepositoryResult } from './util';

export class ProblemPresentationsUseCase {
  constructor(private readonly presentations: ProblemPresentationRepository) {}

  async list(principal: AuthenticatedPrincipal): Promise<AdminProblemPresentationCatalog> {
    const overrides = unwrapRepositoryResult<ProblemPresentationEntity[]>(
      await this.presentations.list(resolveTenantId(principal)),
    );
    return { items: overrides.map(toPresentationView) };
  }

  async update(
    principal: AuthenticatedPrincipal,
    input: UpdateAdminProblemPresentationCommand,
    context: AdminRequestContext,
  ): Promise<AdminProblemPresentationView> {
    const result = await this.presentations.save({
      tenantId: resolveTenantId(principal),
      ruleId: input.ruleId,
      display: input.display,
      severity: input.severity,
      comment: input.comment,
      messageEn: input.messageEn,
      messageRu: input.messageRu,
      expectedRevision: input.expectedRevision,
      actorUserId: principal.subject,
      metadata: { ...context },
    });
    if (result.isErr()) {
      throw new AdminApplicationError(
        result.error.code === 'revision_conflict' ? 'conflict' : 'repository_error',
        result.error.message,
      );
    }

    return toPresentationView(result.value);
  }

  async reset(
    principal: AuthenticatedPrincipal,
    input: ResetAdminProblemPresentationCommand,
    context: AdminRequestContext,
  ): Promise<ResetAdminProblemPresentationResult> {
    const result = await this.presentations.reset({
      tenantId: resolveTenantId(principal),
      ruleId: input.ruleId,
      expectedRevision: input.expectedRevision,
      actorUserId: principal.subject,
      metadata: { ...context },
    });
    if (result.isErr()) {
      throw new AdminApplicationError(
        result.error.code === 'revision_conflict' ? 'conflict' : 'repository_error',
        result.error.message,
      );
    }

    return { ruleId: input.ruleId };
  }
}

const toPresentationView = (override: ProblemPresentationEntity): AdminProblemPresentationView => ({
  comment: override.comment,
  display: override.display,
  messageEn: override.messageEn,
  messageRu: override.messageRu,
  revision: override.revision,
  ruleId: override.ruleId,
  severity: override.severity,
  updatedAt: override.updatedAt.toISOString(),
});
