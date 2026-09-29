/* eslint-disable no-await-in-loop -- Ordered calls verify tenant filters and guard mutations on a shared fixture. */
// @requirements REQ-AUTH-PERSISTENCE-007 REQ-AUTH-CREDENTIAL-003 REQ-AUTH-IDENTITY-005
import type { Db, MongoClient } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, AuthProviderChannel, DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
import { MongoAuthTokenRepository } from './auth-mongo-token.repository';
import { MongoAuthLoginEventRepository } from './auth-mongo-analytics.repository';
import { MongoProblemPresentationRepository } from './auth-mongo-problem-presentation.repository';
import {
  MongoAuthLinkTokenRepository,
  MongoAuthMethodRepository,
  MongoAuthProviderTokenRepository,
  MongoExternalIdentityRepository,
} from './auth-mongo-social.repository';
import type { MongoAuthDocument } from './auth-mongo.util';

const tenantId = DefaultAuthTenantId;
const now = new Date('2026-09-30T09:00:00Z');
const document = (fields: Record<string, unknown> = {}): MongoAuthDocument => ({
  _id: 'record',
  tenantId,
  userId: 'user',
  ...fields,
});

function fixture(records: MongoAuthDocument[] = [document()]) {
  const cursor = {
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    toArray: vi.fn(() => Promise.resolve(records)),
    next: vi.fn(() => Promise.resolve(records[0] ?? null)),
  };
  cursor.sort.mockReturnValue(cursor);
  cursor.skip.mockReturnValue(cursor);
  cursor.limit.mockReturnValue(cursor);
  const store = {
    find: vi.fn(() => cursor),
    findOne: vi.fn(() => Promise.resolve(records[0] ?? null)),
    findOneAndUpdate: vi.fn(() => Promise.resolve(records[0] ?? null)),
    findOneAndDelete: vi.fn(() => Promise.resolve(records[0] ?? null)),
    insertOne: vi.fn<(record: MongoAuthDocument, options?: unknown) => Promise<unknown>>(() =>
      Promise.resolve({ acknowledged: true }),
    ),
    deleteOne: vi.fn(() => Promise.resolve({ deletedCount: records.length })),
    deleteMany: vi.fn(() => Promise.resolve({ deletedCount: records.length })),
    updateMany: vi.fn(() => Promise.resolve({ modifiedCount: records.length })),
    countDocuments: vi.fn(() => Promise.resolve(records.length)),
  };
  const session = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(() => Promise.resolve()),
    abortTransaction: vi.fn(() => Promise.resolve()),
    endSession: vi.fn(() => Promise.resolve()),
    inTransaction: () => true,
  };
  return {
    database: { collection: () => store } as unknown as Db,
    client: { startSession: () => session } as unknown as MongoClient,
    cursor,
    store,
    session,
  };
}

describe('Mongo auth token and identity adapters', () => {
  it('consumes live unconsumed recovery tokens with optional cross-tenant lookup and bounded cleanup', async () => {
    const f = fixture();
    const tokens = new MongoAuthTokenRepository(f.database);
    const created = (
      await tokens.createUserToken({
        id: 'token',
        userId: 'user',
        purpose: 'password_reset',
        tokenHash: 'hash',
        expiresAt: now,
      })
    )._unsafeUnwrap();
    expect(created).toMatchObject({ id: 'token', tenantId, consumedAt: null });
    for (const tenant of [undefined, null, tenantId]) {
      expect((await tokens.consumeUserToken('hash', 'password_reset', tenant, now))._unsafeUnwrap()).toMatchObject({
        id: 'record',
      });
      expect(f.store.findOneAndUpdate).toHaveBeenLastCalledWith(
        {
          tokenHash: 'hash',
          purpose: 'password_reset',
          consumedAt: null,
          expiresAt: { $gt: now },
          ...(tenant ? { tenantId } : {}),
        },
        { $set: { consumedAt: now, updatedAt: now } },
        expect.objectContaining({ includeResultMetadata: false }),
      );
    }
    expect((await tokens.revokeUserToken('hash'))._unsafeUnwrap()).toBe(true);
    expect((await tokens.cleanupExpiredTokens(now))._unsafeUnwrap()).toEqual({ userTokensDeleted: 1 });
    const missing = fixture([]);
    const absent = new MongoAuthTokenRepository(missing.database);
    expect((await absent.consumeUserToken('hash', 'email_verification'))._unsafeUnwrap()).toBeNull();
    expect((await absent.revokeUserToken('hash', 'other'))._unsafeUnwrap()).toBe(false);
    await absent.cleanupExpiredTokens();
  });

  it('normalizes provider profiles and never looks up or deletes identities across tenants', async () => {
    const f = fixture();
    const identities = new MongoExternalIdentityRepository(f.database);
    const input = {
      userId: 'user',
      provider: AuthProvider.Discord as const,
      providerSubject: 'subject',
      channel: AuthProviderChannel.DiscordOauth as const,
    };
    await identities.upsertIdentity(input);
    await identities.upsertIdentity({
      ...input,
      tenantId: 'other',
      email: ' member@example.test ',
      emailVerified: true,
      displayName: ' Member ',
      username: ' member ',
      avatarUrl: ' https://example.test/avatar ',
      locale: ' ru ',
      profileMetadata: { verified: true },
      linkedAt: now,
      lastAuthenticatedAt: now,
    });
    expect(f.store.findOneAndUpdate).toHaveBeenLastCalledWith(
      { tenantId: 'other', provider: input.provider, providerSubject: 'subject' },
      expect.objectContaining({
        $set: expect.objectContaining({ email: 'member@example.test', username: 'member', locale: 'ru' }),
      }),
      expect.objectContaining({ upsert: true }),
    );
    expect((await identities.findByProviderSubject(input.provider, 'subject'))._unsafeUnwrap()).toMatchObject({
      id: 'record',
    });
    expect((await identities.findByUser('user', 'other'))._unsafeUnwrap()).toHaveLength(1);
    expect(f.store.find).toHaveBeenLastCalledWith({ userId: 'user', tenantId: 'other' });
    expect((await identities.deleteById('record', 'user'))._unsafeUnwrap()).toBe(true);
    const missing = fixture([]);
    const absent = new MongoExternalIdentityRepository(missing.database);
    expect((await absent.findByProviderSubject(input.provider, 'subject', 'other'))._unsafeUnwrap()).toBeNull();
    expect((await absent.deleteById('record', 'user', 'other'))._unsafeUnwrap()).toBe(false);
    expect((await absent.upsertIdentity(input))._unsafeUnwrapErr().message).toContain('no document');
  });

  it('keeps method ownership and last-used order while accepting password and provider AMR', async () => {
    const f = fixture();
    const methods = new MongoAuthMethodRepository(f.database);
    await methods.upsertMethod({ userId: 'user', method: 'password' });
    expect(f.store.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ tenantId, externalIdentityId: null }),
      expect.objectContaining({ $set: expect.objectContaining({ amr: ['pwd'] }) }),
      expect.anything(),
    );
    await methods.upsertMethod({
      userId: 'user',
      method: AuthProviderChannel.DiscordOauth,
      tenantId: 'other',
      externalIdentityId: 'identity',
      amr: ['oauth'],
      lastUsedAt: now,
    });
    await methods.upsertMethod({ userId: 'user', method: AuthProviderChannel.DiscordOauth });
    expect((await methods.recordLastUsed('record', tenantId, now))._unsafeUnwrap()).toMatchObject({ id: 'record' });
    expect((await methods.findByUser('user'))._unsafeUnwrap()).toHaveLength(1);
    expect((await methods.findLastUsedByUser('user', 'other'))._unsafeUnwrap()).toMatchObject({ id: 'record' });
    expect(f.store.find).toHaveBeenLastCalledWith({ tenantId: 'other', userId: 'user', lastUsedAt: { $ne: null } });
    expect((await methods.countUsableMethodsForUser('user'))._unsafeUnwrap()).toBe(1);
    const missing = fixture([]);
    const absent = new MongoAuthMethodRepository(missing.database);
    expect((await absent.recordLastUsed('record', 'other', now))._unsafeUnwrap()).toBeNull();
    expect((await absent.findLastUsedByUser('user'))._unsafeUnwrap()).toBeNull();
    expect((await absent.upsertMethod({ userId: 'user', method: 'password' }))._unsafeUnwrapErr().message).toContain(
      'no document',
    );
  });

  it('requires unused, unrevoked, unexpired link tokens and supports explicit tenant ownership', async () => {
    const f = fixture();
    const links = new MongoAuthLinkTokenRepository(f.database);
    const input = {
      provider: AuthProvider.Discord as const,
      purpose: 'link' as const,
      tokenHash: 'link-hash',
      expiresAt: now,
    };
    await links.createToken(input);
    const created = (
      await links.createToken({
        ...input,
        id: 'link',
        tenantId: 'other',
        userId: 'user',
        nonce: ' nonce ',
        deepLinkMetadata: { route: 'link' },
      })
    )._unsafeUnwrap();
    expect(created).toMatchObject({ id: 'link', tenantId: 'other', nonce: 'nonce' });
    for (const tenant of [undefined, null, tenantId]) {
      await links.consumeToken('link-hash', 'link', tenant, now);
      expect(f.store.findOneAndUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ consumedAt: null, revokedAt: null, expiresAt: { $gt: now } }),
        expect.anything(),
        expect.anything(),
      );
    }
    expect((await links.revokeToken('link-hash'))._unsafeUnwrap()).toBe(true);
    const missing = fixture([]);
    const absent = new MongoAuthLinkTokenRepository(missing.database);
    expect((await absent.consumeToken('hash', 'link'))._unsafeUnwrap()).toBeNull();
    expect((await absent.revokeToken('hash', 'other', now))._unsafeUnwrap()).toBe(false);
  });

  it('stores encrypted provider credentials but returns only redacted token metadata', async () => {
    const encrypted = {
      userId: 'user',
      externalIdentityId: 'identity',
      provider: AuthProvider.Discord as const,
      tokenKind: 'access' as const,
      ciphertext: 'ciphertext',
      iv: 'iv',
      authTag: 'tag',
      keyId: 'key',
    };
    const f = fixture([document({ ...encrypted, scopes: ['profile'], expiresAt: now, revokedAt: null })]);
    const tokens = new MongoAuthProviderTokenRepository(f.database);
    const created = (await tokens.persistEncryptedToken(encrypted))._unsafeUnwrap();
    expect(created).toMatchObject({ ciphertext: 'ciphertext', scopes: [], expiresAt: null });
    await tokens.persistEncryptedToken({
      ...encrypted,
      tenantId: 'other',
      scopes: ['profile'],
      expiresAt: now,
    });
    const views = (await tokens.listRedactedByExternalIdentity('identity'))._unsafeUnwrap();
    expect(views[0]).toMatchObject({ redacted: true, keyId: 'key', scopes: ['profile'] });
    for (const field of ['ciphertext', 'iv', 'authTag']) {
      expect(views[0]).not.toHaveProperty(field);
    }
    expect((await tokens.revokeToken('record'))._unsafeUnwrap()).toMatchObject({ id: 'record' });
    const missing = fixture([]);
    expect(
      (
        await new MongoAuthProviderTokenRepository(missing.database).revokeToken('missing', 'other', now)
      )._unsafeUnwrap(),
    ).toBeNull();
  });
});

describe('Mongo login analytics and presentation transactions', () => {
  it('records analytics and outbox atomically with safe defaults and explicit context', async () => {
    const f = fixture();
    const analytics = new MongoAuthLoginEventRepository(f.database, f.client);
    const input = { eventType: 'login' as const, outcome: 'success' as const, provider: 'password', channel: 'web' };
    expect((await analytics.record(input))._unsafeUnwrap()).toMatchObject({ tenantId, userId: null, ipAddress: null });
    await analytics.record({
      ...input,
      tenantId: 'other',
      userId: 'user',
      identifierHash: 'hash',
      sessionId: 'session',
      failureCode: 'denied',
      ipAddress: 'address',
      ipHash: 'hash',
      countryCode: 'UZ',
      region: 'region',
      city: 'city',
      timezone: 'Asia/Tashkent',
      timezoneSource: 'profile',
      language: 'ru',
      languageSource: 'profile',
      userAgent: 'agent',
      requestId: 'request',
      occurredAt: now,
      networkAnonymizedAt: now,
    });
    expect(f.store.insertOne).toHaveBeenCalledTimes(4);
    expect(f.session.commitTransaction).toHaveBeenCalledTimes(2);
    expect(f.session.endSession).toHaveBeenCalledTimes(2);
  });

  it('applies tenant and inclusive time filters, bounded pagination, summaries and retention', async () => {
    const f = fixture([
      document({ outcome: 'success', countryCode: 'UZ', userId: 'one' }),
      document({ outcome: 'failure', countryCode: 'UZ', userId: 'one' }),
      document({ outcome: 'failure', countryCode: null, userId: null }),
    ]);
    const analytics = new MongoAuthLoginEventRepository(f.database, f.client);
    await analytics.list();
    await analytics.count();
    const query = {
      tenantId: 'other',
      userId: 'one',
      outcome: 'failure' as const,
      provider: 'password',
      countryCode: 'UZ',
      language: 'ru',
      timezone: 'Asia/Tashkent',
      occurredFrom: now,
      occurredTo: now,
      limit: 1000,
      offset: -2,
    };
    expect((await analytics.list(query))._unsafeUnwrap()).toHaveLength(3);
    expect(f.cursor.limit).toHaveBeenLastCalledWith(100);
    expect(f.cursor.skip).toHaveBeenLastCalledWith(0);
    await analytics.count(query);
    expect(f.store.countDocuments).toHaveBeenLastCalledWith(
      expect.objectContaining({ tenantId: 'other', occurredAt: { $gte: now, $lte: now } }),
    );
    await analytics.list({ occurredFrom: now });
    await analytics.list({ occurredTo: now });
    const summary = (await analytics.summary())._unsafeUnwrap();
    expect(summary).toMatchObject({
      total: 3,
      successful: 1,
      failed: 2,
      uniqueUsers: 1,
      successRate: 33.33,
      byCountry: [
        { key: 'UZ', count: 2 },
        { key: 'unknown', count: 1 },
      ],
    });
    expect(await analytics.applyRetention({ anonymizeBefore: now, deleteBefore: now })).toEqual({
      anonymized: 3,
      deleted: 3,
    });
    await analytics.applyRetention({ tenantId: 'other', anonymizeBefore: now, deleteBefore: now, now });
    const missing = fixture([]);
    expect(
      (await new MongoAuthLoginEventRepository(missing.database, missing.client).summary(query))._unsafeUnwrap(),
    ).toMatchObject({ total: 0, successRate: 0 });
  });

  it('preserves legacy presentation fallbacks and distinguishes revision conflicts from infrastructure failures', async () => {
    const record = document({
      ruleId: 'rule',
      display: 'toast',
      severity: 'error',
      messageEn: 'English',
      messageRu: 'Russian',
      revision: 1,
    });
    const f = fixture([record]);
    const presentations = new MongoProblemPresentationRepository(f.database, f.client);
    const input = {
      ruleId: 'rule',
      display: 'toast' as const,
      severity: 'error' as const,
      expectedRevision: 0,
      actorUserId: 'actor',
    };
    const created = (await presentations.save(input))._unsafeUnwrap();
    expect(created).toMatchObject({ textsEn: [], textsRu: [], textsZh: [], support: false, figmaOnly: false });
    await presentations.save({
      ...input,
      tenantId: 'other',
      comment: ' comment ',
      messageEn: ' English ',
      messageRu: ' Russian ',
      messageZh: ' Chinese ',
      support: true,
      customDescription: 'description',
      figmaOnly: true,
      metadata: { request: 'request' },
    });
    await presentations.save({ ...input, expectedRevision: 1, textsEn: ['one'], textsRu: ['two'], textsZh: ['three'] });
    expect((await presentations.list())._unsafeUnwrap()).toEqual([expect.objectContaining({ id: 'record' })]);
    expect(
      (await presentations.reset({ ruleId: 'rule', expectedRevision: 1, actorUserId: 'actor' }))._unsafeUnwrap(),
    ).toBe(true);
    const missing = fixture([]);
    const absent = new MongoProblemPresentationRepository(missing.database, missing.client);
    expect((await absent.save({ ...input, expectedRevision: 1 }))._unsafeUnwrapErr().code).toBe('revision_conflict');
    expect((await absent.reset({ ruleId: 'rule', expectedRevision: 0, actorUserId: 'actor' }))._unsafeUnwrap()).toBe(
      false,
    );
    expect(
      (await absent.reset({ ruleId: 'rule', expectedRevision: 1, actorUserId: 'actor' }))._unsafeUnwrapErr().code,
    ).toBe('revision_conflict');
    f.store.insertOne.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
    expect((await presentations.save(input))._unsafeUnwrapErr().code).toBe('revision_conflict');
    f.store.insertOne.mockRejectedValueOnce(new Error('storage unavailable'));
    expect((await presentations.save(input))._unsafeUnwrapErr()).toMatchObject({
      code: 'repository_error',
      message: 'storage unavailable',
    });
  });
});
