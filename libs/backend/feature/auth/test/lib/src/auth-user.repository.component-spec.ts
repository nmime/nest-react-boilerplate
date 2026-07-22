import { MikroORM } from '@mikro-orm/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import { type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AdminAuditLogEntity,
  AdminAuditLogEntitySchema,
  AdminUserMutationRepository,
  AuthPermissionEntity,
  AuthPostgresModule,
  AuthRoleEntity,
  AuthRolePermissionEntity,
  AuthUserEntity,
  AuthUserEntitySchema,
  AuthUserPermissionEntity,
  AuthUserRoleEntity,
  AuthUserRepository,
  TransactionalOutboxEventEntity,
  TransactionalOutboxEventEntitySchema,
} from '@app/backend-postgres-main-auth';

const dockerAvailable = hasDockerRuntime();
if (!dockerAvailable) {
  process.stderr.write('AuthUserRepository component tests: skipped because Docker is not available on this host.\n');
}
const describeIfDocker = dockerAvailable ? describe : describe.skip;

describeIfDocker('AuthUserRepository component', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let moduleRef: TestingModule | undefined;
  let app: NestFastifyApplication | undefined;
  let orm: MikroORM;
  let authUsers: AuthUserRepository;
  let adminUserMutations: AdminUserMutationRepository;

  async function grantNormalizedRole(
    user: AuthUserEntity,
    roleKey: string,
    permissionKeys: readonly string[],
  ): Promise<void> {
    let role = await orm.em.findOne(AuthRoleEntity, { tenantId: user.tenantId, key: roleKey });
    if (!role) {
      role = new AuthRoleEntity({ tenantId: user.tenantId, key: roleKey });
      orm.em.persist(role);
    }

    const permissions: AuthPermissionEntity[] = [];
    for (const key of permissionKeys) {
      let permission = await orm.em.findOne(AuthPermissionEntity, { key });
      if (!permission) {
        const separator = key.lastIndexOf(':');
        permission = new AuthPermissionEntity({
          key,
          resource: key.slice(0, separator).replaceAll(':', '.'),
          action: key.slice(separator + 1),
        });
        orm.em.persist(permission);
      }
      permissions.push(permission);
    }
    await orm.em.flush();

    if (!(await orm.em.findOne(AuthUserRoleEntity, { userId: user.id, roleId: role.id }))) {
      orm.em.persist(new AuthUserRoleEntity({ userId: user.id, roleId: role.id, tenantId: user.tenantId }));
    }
    for (const permission of permissions) {
      if (!(await orm.em.findOne(AuthRolePermissionEntity, { roleId: role.id, permissionId: permission.id }))) {
        orm.em.persist(new AuthRolePermissionEntity({ roleId: role.id, permissionId: permission.id }));
      }
    }
    await orm.em.flush();
  }

  beforeAll(async () => {
    container = await startPostgresContainer();

    moduleRef = await Test.createTestingModule({
      imports: [
        MikroOrmModule.forRoot(
          createPostgresContainerMikroOrmOptions(container, [
            AdminAuditLogEntitySchema,
            AuthUserEntitySchema,
            TransactionalOutboxEventEntitySchema,
          ]),
        ),
        AuthPostgresModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();

    orm = moduleRef.get(MikroORM);
    await orm.schema.refresh();
    authUsers = moduleRef.get(AuthUserRepository);
    adminUserMutations = moduleRef.get(AdminUserMutationRepository);
  });

  afterEach(async () => {
    await orm.em.nativeDelete(TransactionalOutboxEventEntity, {});
    await orm.em.nativeDelete(AdminAuditLogEntity, {});
    await orm.em.nativeDelete(AuthUserRoleEntity, {});
    await orm.em.nativeDelete(AuthUserPermissionEntity, {});
    await orm.em.nativeDelete(AuthRolePermissionEntity, {});
    await orm.em.nativeDelete(AuthRoleEntity, {});
    await orm.em.nativeDelete(AuthPermissionEntity, {});
    await orm.em.nativeDelete(AuthUserEntity, {});
    orm.em.clear();
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await stopPostgresContainer(container);
  });

  it('creates and finds users through a real Postgres repository', async () => {
    const created = await authUsers.createUser({
      email: 'user@example.com',
      displayName: 'Component User',
    });

    const user = created._unsafeUnwrap();
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    expect(user.email).toBe('user@example.com');
    await grantNormalizedRole(user, 'user', ['profile:read']);

    const found = await authUsers.findByEmail('user@example.com');
    expect(found._unsafeUnwrap()).toMatchObject({
      id: user.id,
      email: 'user@example.com',
      displayName: 'Component User',
      permissions: ['profile:read'],
      roles: ['user'],
      status: 'active',
    });
  });

  it('records logins and returns access from normalized grants', async () => {
    const user = (await authUsers.createUser({ email: 'admin@example.com' }))._unsafeUnwrap();
    await grantNormalizedRole(user, 'admin', ['admin:users:read']);
    const loggedInAt = new Date('2026-01-01T00:00:00.000Z');
    const login = await authUsers.recordLogin(user.id, loggedInAt);

    expect(login._unsafeUnwrap()).toMatchObject({
      permissions: ['admin:users:read'],
      roles: ['admin'],
    });
    expect(login._unsafeUnwrap()?.lastLoginAt.toISOString()).toBe(loggedInAt.toISOString());
  });

  it('persists supported locales and rejects unsupported locales', async () => {
    const user = (
      await authUsers.createUser({
        email: 'locale@example.com',
        locale: 'ru',
      })
    )._unsafeUnwrap();

    expect(user.locale).toBe('ru');
    expect((await authUsers.setLocale(user.id, 'en'))._unsafeUnwrap()).toMatchObject({ locale: 'en' });
    expect((await authUsers.setLocale(user.id, 'ru'))._unsafeUnwrap()).toMatchObject({ locale: 'ru' });

    const unsupportedLocale = 'es' as unknown as Parameters<AuthUserRepository['setLocale']>[1];
    const unsupported = await authUsers.setLocale(user.id, unsupportedLocale);

    expect(unsupported._unsafeUnwrapErr()).toMatchObject({
      code: 'repository_error',
    });
  });

  it('returns null for missing users', async () => {
    const found = await authUsers.findByEmail('missing@example.com');

    expect(found._unsafeUnwrap()).toBeNull();
    expect((await authUsers.findById('00000000-0000-4000-8000-000000000000'))._unsafeUnwrap()).toBeNull();
    expect((await authUsers.recordLogin('00000000-0000-4000-8000-000000000000'))._unsafeUnwrap()).toBeNull();
  });

  it('maps real unique-constraint failures to repository errors', async () => {
    await authUsers.createUser({ email: 'duplicate@example.com' }).mapErr((error) => {
      throw new Error(error.message);
    });

    const duplicate = await authUsers.createUser({
      email: 'duplicate@example.com',
    });

    expect(duplicate._unsafeUnwrapErr().code).toBe('repository_error');
  });

  it('atomically writes sensitive admin mutations with audit and outbox rows', async () => {
    const user = (
      await authUsers.createUser({
        email: 'powerful-admin@example.com',
      })
    )._unsafeUnwrap();
    const actor = (
      await authUsers.createUser({
        email: 'second-powerful-admin@example.com',
      })
    )._unsafeUnwrap();
    await grantNormalizedRole(user, 'admin', ['admin:users:write', 'admin:users:access-policy:update']);
    await grantNormalizedRole(actor, 'admin', ['admin:users:write', 'admin:users:access-policy:update']);

    const mutation = await adminUserMutations.mutateAccessPolicyWithAudit({
      targetUserId: user.id,
      actorUserId: actor.id,
      action: 'admin.user.status.update',
      policy: { status: 'disabled' },
      audit: { metadata: { requestId: 'req-component' } },
    });

    expect(mutation._unsafeUnwrap()).toMatchObject({
      before: { status: 'active' },
      after: { status: 'disabled' },
      auditLog: {
        action: 'admin.user.status.update',
        before: { status: 'active' },
        after: { status: 'disabled' },
      },
      outboxEvent: {
        aggregateType: 'admin.user',
        aggregateId: user.id,
        eventType: 'admin.user.status.update',
        status: 'pending',
      },
    });
    expect(await orm.em.count(AdminAuditLogEntity, {})).toBe(1);
    expect(await orm.em.count(TransactionalOutboxEventEntity, {})).toBe(1);
  });

  it('blocks last powerful admin changes when another active user lacks required permissions', async () => {
    const onlyPowerfulAdmin = (
      await authUsers.createUser({
        email: 'only-powerful-admin@example.com',
      })
    )._unsafeUnwrap();
    const nonPowerfulUser = (
      await authUsers.createUser({
        email: 'non-powerful-user@example.com',
      })
    )._unsafeUnwrap();
    await grantNormalizedRole(onlyPowerfulAdmin, 'admin', ['admin:users:write', 'admin:users:access-policy:update']);
    await grantNormalizedRole(nonPowerfulUser, 'member', ['admin:users:read']);

    const mutation = await adminUserMutations.mutateAccessPolicyWithAudit({
      targetUserId: onlyPowerfulAdmin.id,
      actorUserId: '00000000-0000-4000-8000-000000000099',
      action: 'admin.user.access_policy.update',
      policy: {
        roles: ['member'],
        permissions: ['admin:users:write'],
      },
      audit: { metadata: { requestId: 'req-component' } },
    });

    expect(mutation._unsafeUnwrapErr().message).toBe(
      'At least one active administrator must retain admin write access.',
    );
    expect(await orm.em.count(AdminAuditLogEntity, {})).toBe(0);
    expect(await orm.em.count(TransactionalOutboxEventEntity, {})).toBe(0);
  });
});
