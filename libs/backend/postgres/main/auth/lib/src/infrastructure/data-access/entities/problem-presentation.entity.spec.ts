import { describe, expect, it } from 'vitest';
import { DefaultAuthTenantId, ProblemPresentationEntity, ProblemPresentationEntitySchema } from './index';

describe('ProblemPresentationEntity', () => {
  it('creates a revisioned override with safe defaults', () => {
    const entity = new ProblemPresentationEntity({
      ruleId: 'user-app-api:PATCH:/profile:409:resource-conflict',
      display: 'toast',
      severity: 'warning',
      updatedByUserId: '00000000-0000-4000-8000-000000000002',
    });

    expect(entity).toMatchObject({
      tenantId: DefaultAuthTenantId,
      ruleId: 'user-app-api:PATCH:/profile:409:resource-conflict',
      comment: '',
      messageEn: '',
      messageRu: '',
      display: 'toast',
      revision: 1,
      severity: 'warning',
    });
    expect(entity.id).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('registers tenant uniqueness and database validation constraints', () => {
    ProblemPresentationEntitySchema.init();

    expect(ProblemPresentationEntitySchema.meta.tableName).toBe('problem_presentation_overrides');
    expect(ProblemPresentationEntitySchema.meta.uniques).toContainEqual(
      expect.objectContaining({ properties: ['tenantId', 'ruleId'] }),
    );
    expect(ProblemPresentationEntitySchema.meta.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'ck__problem_presentation_overrides__rule_id',
        'ck__problem_presentation_overrides__display',
        'ck__problem_presentation_overrides__severity',
        'ck__problem_presentation_overrides__revision',
      ]),
    );
  });

  it('supports ORM hydration and timestamp lifecycle callbacks', () => {
    const entity = new ProblemPresentationEntity();

    expect(entity).toMatchObject({
      tenantId: DefaultAuthTenantId,
      comment: '',
      messageEn: '',
      messageRu: '',
      revision: 1,
    });

    ProblemPresentationEntitySchema.init();
    const createdAt = ProblemPresentationEntitySchema.meta.properties.createdAt;
    const updatedAt = ProblemPresentationEntitySchema.meta.properties.updatedAt;
    const createdAtOnCreate = createdAt.onCreate as NonNullable<typeof createdAt.onCreate>;
    const updatedAtOnCreate = updatedAt.onCreate as NonNullable<typeof updatedAt.onCreate>;
    const updatedAtOnUpdate = updatedAt.onUpdate as NonNullable<typeof updatedAt.onUpdate>;

    expect(createdAtOnCreate(entity, undefined as never)).toBeInstanceOf(Date);
    expect(updatedAtOnCreate(entity, undefined as never)).toBeInstanceOf(Date);
    expect(updatedAtOnUpdate(entity, undefined as never)).toBeInstanceOf(Date);
  });
});
