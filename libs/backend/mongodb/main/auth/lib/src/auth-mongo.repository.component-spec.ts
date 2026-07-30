// @requirements REQ-AUTH-PERSISTENCE-007
import { randomUUID } from 'node:crypto';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { AuthProvider, AuthProviderChannel, DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ResultAsync } from 'neverthrow';
import { initializeMongoAuthPersistence, AuthMongoCollections } from './auth-mongo.collections';
import { MongoAuthUserRepository } from './auth-mongo-user.repository';
import { MongoAuthTokenRepository } from './auth-mongo-token.repository';
import { MongoAuthRoleRepository, MongoAuthUserRoleRepository } from './auth-mongo-rbac.repository';
import { MongoAuthLinkTokenRepository, MongoExternalIdentityRepository } from './auth-mongo-social.repository';
import { MongoAdminAuditLogRepository, MongoAdminUserMutationRepository } from './auth-mongo-admin.repository';
import { MongoProblemPresentationRepository } from './auth-mongo-problem-presentation.repository';

describe('Mongo auth repositories on a replica set', () => {
  let container: StartedMongoDBContainer;
  let client: MongoClient;

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:7.0.26-jammy').start();
    const separator = container.getConnectionString().includes('?') ? '&' : '?';
    client = new MongoClient(`${container.getConnectionString()}${separator}directConnection=true&replicaSet=rs0`);
    await client.connect();
  });

  beforeEach(async () => {
    const database = client.db('auth_component');
    await database.dropDatabase();
    await initializeMongoAuthPersistence(database);
  });

  afterAll(async () => {
    await client.close();
    await container.stop();
  });

  const repositories = () => {
    const database = client.db('auth_component');
    return {
      database,
      users: new MongoAuthUserRepository(database),
      tokens: new MongoAuthTokenRepository(database),
      roles: new MongoAuthRoleRepository(database, client),
      userRoles: new MongoAuthUserRoleRepository(database, client),
      identities: new MongoExternalIdentityRepository(database),
      linkTokens: new MongoAuthLinkTokenRepository(database),
      audit: new MongoAdminAuditLogRepository(database, client),
      mutations: new MongoAdminUserMutationRepository(database, client),
      presentations: new MongoProblemPresentationRepository(database, client),
    };
  };

  it('isolates tenants and reloads users with database-authoritative RBAC', async () => {
    const first = repositories();
    const tenantId = randomUUID();
    const user = await unwrap(first.users.createUser({ tenantId, email: 'member@example.com', passwordHash: 'hash' }));
    await unwrap(first.userRoles.assignRoles({ tenantId, userId: user.id, roleKeys: ['user'] }));

    const reloaded = repositories();
    await expect(unwrap(reloaded.users.findById(user.id, tenantId))).resolves.toMatchObject({
      id: user.id,
      roles: ['user'],
      permissions: ['profile:read'],
    });
    await expect(unwrap(reloaded.users.findById(user.id, DefaultAuthTenantId))).resolves.toBeNull();
  });

  it('consumes a one-time token exactly once under concurrency', async () => {
    const { linkTokens, tokens } = repositories();
    await unwrap(
      tokens.createUserToken({
        id: randomUUID(),
        userId: randomUUID(),
        purpose: 'password_reset',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );

    const consumed = await Promise.all([
      unwrap(tokens.consumeUserToken('hash', 'password_reset')),
      unwrap(tokens.consumeUserToken('hash', 'password_reset')),
      unwrap(tokens.consumeUserToken('hash', 'password_reset')),
    ]);
    expect(consumed.filter(Boolean)).toHaveLength(1);

    await unwrap(
      linkTokens.createToken({
        provider: AuthProvider.Discord,
        purpose: 'link',
        tokenHash: 'link-hash',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    const links = await Promise.all([
      unwrap(linkTokens.consumeToken('link-hash', 'link')),
      unwrap(linkTokens.consumeToken('link-hash', 'link')),
    ]);
    expect(links.filter(Boolean)).toHaveLength(1);
  });

  it('enforces compound external identity uniqueness and tenant lookup isolation', async () => {
    const { identities } = repositories();
    const tenantId = randomUUID();
    const identity = await unwrap(
      identities.upsertIdentity({
        tenantId,
        userId: randomUUID(),
        provider: AuthProvider.Discord,
        providerSubject: 'subject',
        channel: AuthProviderChannel.DiscordOauth,
      }),
    );
    const updated = await unwrap(
      identities.upsertIdentity({
        tenantId,
        userId: identity.userId,
        provider: AuthProvider.Discord,
        providerSubject: 'subject',
        channel: AuthProviderChannel.DiscordOauth,
        username: 'member',
      }),
    );

    expect(updated.id).toBe(identity.id);
    await expect(
      unwrap(identities.findByProviderSubject(AuthProvider.Discord, 'subject', randomUUID())),
    ).resolves.toBeNull();
  });

  it('rolls back an audited operation and commits audit plus outbox atomically', async () => {
    const { audit, database } = repositories();
    await expect(
      audit.recordTransactionally({
        operation: async (session) => {
          await database
            .collection<{ _id: string }>('component_mutations')
            .insertOne({ _id: randomUUID() }, { session: session as import('mongodb').ClientSession });
          throw new Error('rollback');
        },
        audit: () => ({ action: 'admin.access', resource: 'admin.users' }),
      }),
    ).rejects.toThrow('rollback');
    expect(await database.collection('component_mutations').countDocuments()).toBe(0);

    await unwrap(audit.record({ action: 'admin.access', resource: 'admin.users' }));
    await expect(
      Promise.all([
        database.collection(AuthMongoCollections.auditLogs).countDocuments(),
        database.collection(AuthMongoCollections.outbox).countDocuments(),
      ]),
    ).resolves.toEqual([1, 1]);
  });

  it('serializes concurrent mutations so one powerful administrator remains', async () => {
    const { users, userRoles, mutations } = repositories();
    const first = await unwrap(users.createUser({ email: 'first@example.com', passwordHash: 'hash' }));
    const second = await unwrap(users.createUser({ email: 'second@example.com', passwordHash: 'hash' }));
    await unwrap(userRoles.assignRoles({ userId: first.id, roleKeys: ['admin'] }));
    await unwrap(userRoles.assignRoles({ userId: second.id, roleKeys: ['admin'] }));

    const results = await Promise.all([
      mutations.mutateAccessPolicyWithAudit({
        targetUserId: first.id,
        actorUserId: randomUUID(),
        action: 'admin.user.status.update',
        policy: { status: 'disabled' },
        audit: {},
      }),
      mutations.mutateAccessPolicyWithAudit({
        targetUserId: second.id,
        actorUserId: randomUUID(),
        action: 'admin.user.status.update',
        policy: { status: 'disabled' },
        audit: {},
      }),
    ]);
    expect(results.filter((result) => result.isOk())).toHaveLength(1);
    const active = await unwrap(users.listUsers({ status: 'active' }));
    expect(active).toHaveLength(1);
    expect(active[0]?.permissions).toEqual(
      expect.arrayContaining(['admin:users:write', 'admin:users:access-policy:update']),
    );
  });

  it('supports custom roles and permission revisions', async () => {
    const { roles } = repositories();
    const role = await unwrap(roles.createRole({ key: 'support', label: 'Support' }));
    const updated = await unwrap(roles.setRolePermissions(role.id, ['admin:users:read']));
    expect(updated).toMatchObject({ role: { id: role.id }, permissionKeys: ['admin:users:read'] });
    await expect(unwrap(roles.listRolesWithPermissions())).resolves.toContainEqual(updated);
  });

  it('removes obsolete managed grants while preserving administrator-owned grants', async () => {
    const { database } = repositories();
    const role = await database.collection(AuthMongoCollections.roles).findOne({
      tenantId: DefaultAuthTenantId,
      key: 'user',
    });
    if (!role) {
      throw new Error('Expected the default user role.');
    }
    const now = new Date();
    const managedPermissionId = randomUUID();
    const customPermissionId = randomUUID();
    await database.collection<{ _id: string; [key: string]: unknown }>(AuthMongoCollections.permissions).insertMany([
      {
        _id: managedPermissionId,
        key: `obsolete:${randomUUID()}`,
        resource: 'obsolete',
        action: 'managed',
        description: '',
        createdAt: now,
      },
      {
        _id: customPermissionId,
        key: `custom:${randomUUID()}`,
        resource: 'custom',
        action: 'owned',
        description: '',
        createdAt: now,
      },
    ]);
    await database
      .collection<{ _id: string; [key: string]: unknown }>(AuthMongoCollections.rolePermissions)
      .insertMany([
        {
          _id: randomUUID(),
          roleId: String(role._id),
          permissionId: managedPermissionId,
          managed: true,
          createdAt: now,
        },
        {
          _id: randomUUID(),
          roleId: String(role._id),
          permissionId: customPermissionId,
          managed: false,
          createdAt: now,
        },
      ]);

    await initializeMongoAuthPersistence(database);

    expect(
      await database.collection(AuthMongoCollections.rolePermissions).findOne({ permissionId: managedPermissionId }),
    ).toBeNull();
    expect(
      await database.collection(AuthMongoCollections.rolePermissions).findOne({ permissionId: customPermissionId }),
    ).not.toBeNull();
  });

  it('uses expected-revision CAS for problem presentation changes', async () => {
    const { presentations } = repositories();
    const ruleId = 'auth-app-api:POST:/auth/login:401';
    const created = await unwrap(
      presentations.save({
        ruleId,
        display: 'toast',
        severity: 'error',
        expectedRevision: 0,
        actorUserId: randomUUID(),
      }),
    );

    const results = await Promise.all([
      presentations.save({
        ruleId,
        display: 'silent',
        severity: 'warning',
        expectedRevision: created.revision,
        actorUserId: randomUUID(),
      }),
      presentations.save({
        ruleId,
        display: 'toast',
        severity: 'error',
        expectedRevision: created.revision,
        actorUserId: randomUUID(),
      }),
    ]);
    expect(results.filter((result) => result.isOk())).toHaveLength(1);
    expect(results.filter((result) => result.isErr())[0]).toMatchObject({
      error: { code: 'revision_conflict' },
    });
  });
});

async function unwrap<T, E extends { message: string }>(result: ResultAsync<T, E>): Promise<T> {
  const settled = await result;
  if (settled.isErr()) {
    throw new Error(settled.error.message);
  }
  return settled.value;
}
