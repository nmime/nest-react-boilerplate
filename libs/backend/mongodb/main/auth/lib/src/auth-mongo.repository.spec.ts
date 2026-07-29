import { describe, expect, it } from 'vitest';
import { makeAudit, makeOutbox, toDocument } from './auth-mongo-admin.repository';
import { repositoryResult } from './auth-mongo.util';

describe('Mongo auth persistence helpers', () => {
  it('keeps public UUID IDs while mapping documents to Mongo _id', () => {
    const audit = makeAudit({ action: 'admin.access', resource: 'admin.users' });
    const document = toDocument(audit);

    expect(document._id).toBe(audit.id);
    expect(audit.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(document).not.toHaveProperty('id');
  });

  it('creates tenant-scoped pending outbox records', () => {
    const audit = makeAudit({ action: 'admin.user.status.update', resource: 'admin.users' });
    const outbox = makeOutbox(audit, 'admin.user', '00000000-0000-0000-0000-000000000001');

    expect(outbox).toMatchObject({ tenantId: audit.tenantId, status: 'pending', eventType: audit.action });
  });

  it('maps driver failures to the neutral repository contract', async () => {
    const result = await repositoryResult(Promise.reject(new Error('driver failed')));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ code: 'repository_error', message: 'driver failed' });
    }
  });
});
