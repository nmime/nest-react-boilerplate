// @requirements REQ-AUTH-TENANT-004
import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal, ProblemPresentationRecord } from '@app/backend-feature-auth-shared';
import { ProblemPresentationsUseCase } from './problem-presentations.use-case';

const tenantId = '00000000-0000-4000-8000-000000000001';
const actorUserId = '00000000-0000-4000-8000-000000000002';
const ruleId = 'user-app-api:PATCH:/profile:409:resource-conflict';
const principal: AuthenticatedPrincipal = {
  subject: actorUserId,
  tenantId,
  email: 'admin@example.com',
  roles: ['admin'],
  permissions: ['admin:settings:read', 'admin:settings:update'],
};
const context = { requestId: 'request-1', ip: '127.0.0.1', userAgent: 'Vitest' };

const createOverride = () =>
  ({
    id: 'presentation-id',
    tenantId,
    ruleId,
    display: 'silent',
    severity: 'info',
    comment: 'Handled inline',
    messageEn: 'Conflict',
    messageRu: 'Конфликт',
    revision: 3,
    updatedByUserId: actorUserId,
    createdAt: new Date('2026-07-19T12:00:00.000Z'),
    updatedAt: new Date('2026-07-19T13:00:00.000Z'),
  }) satisfies ProblemPresentationRecord;

const createDependencies = () => {
  const presentations = {
    list: vi.fn(() => okAsync([createOverride()])),
    save: vi.fn(() => okAsync(createOverride())),
    reset: vi.fn(() => okAsync(true)),
  };

  return {
    presentations,
    useCase: new ProblemPresentationsUseCase(presentations as never),
  };
};

describe('ProblemPresentationsUseCase', () => {
  it('returns tenant overrides for the generated frontend catalog to merge', async () => {
    const { presentations, useCase } = createDependencies();

    await expect(useCase.list(principal)).resolves.toEqual({
      items: [
        expect.objectContaining({
          comment: 'Handled inline',
          display: 'silent',
          messageEn: 'Conflict',
          messageRu: 'Конфликт',
          revision: 3,
          ruleId,
          severity: 'info',
          updatedAt: '2026-07-19T13:00:00.000Z',
        }),
      ],
    });
    expect(presentations.list).toHaveBeenCalledWith(tenantId);
  });

  it('saves an endpoint-response override with optimistic revision and audit context', async () => {
    const { presentations, useCase } = createDependencies();
    const command = {
      comment: 'Handled inline',
      display: 'silent' as const,
      expectedRevision: 2,
      messageEn: 'Conflict',
      messageRu: 'Конфликт',
      ruleId,
      severity: 'info' as const,
    };

    const result = await useCase.update(principal, command, context);

    expect(presentations.save).toHaveBeenCalledWith({
      actorUserId,
      ...command,
      metadata: context,
      tenantId,
    });
    expect(result).toMatchObject({ ruleId, revision: 3 });
  });

  it('resets an override to the generated default', async () => {
    const { presentations, useCase } = createDependencies();

    await expect(useCase.reset(principal, { expectedRevision: 3, ruleId }, context)).resolves.toEqual({ ruleId });
    expect(presentations.reset).toHaveBeenCalledWith({
      actorUserId,
      expectedRevision: 3,
      metadata: context,
      ruleId,
      tenantId,
    });
  });

  it.each([
    ['revision_conflict', 'The rule changed.'],
    ['repository_error', 'Database unavailable.'],
  ] as const)('maps %s save errors through the admin application boundary', async (code, message) => {
    const { presentations, useCase } = createDependencies();
    presentations.save.mockReturnValue(errAsync({ code, message }) as never);

    await expect(
      useCase.update(principal, { display: 'toast', expectedRevision: 1, ruleId, severity: 'warning' }, context),
    ).rejects.toThrow(message);
  });

  it('maps reset and list repository errors', async () => {
    const { presentations, useCase } = createDependencies();
    presentations.reset.mockReturnValue(errAsync({ code: 'revision_conflict', message: 'The rule changed.' }) as never);
    await expect(useCase.reset(principal, { expectedRevision: 2, ruleId }, context)).rejects.toThrow(
      'The rule changed.',
    );

    presentations.list.mockReturnValue(
      errAsync({ code: 'repository_error', message: 'Database unavailable.' }) as never,
    );
    await expect(useCase.list(principal)).rejects.toThrow('Database unavailable.');
  });
});
