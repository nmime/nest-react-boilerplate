import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  AdminAuditLogEntity,
  AdminAuditLogEntitySchema,
  AuthLinkTokenEntity,
  AuthLinkTokenEntitySchema,
  AuthMethodEntity,
  AuthMethodEntitySchema,
  AuthPermissionEntity,
  AuthPermissionEntitySchema,
  AuthProviderTokenEntity,
  AuthProviderTokenEntitySchema,
  AuthRolePermissionEntity,
  AuthRolePermissionEntitySchema,
  AuthRoleEntitySchema,
  AuthTenantEntitySchema,
  AuthTenantInvitationEntitySchema,
  AuthTenantMembershipEntitySchema,
  AuthUserTokenEntity,
  AuthUserTokenEntitySchema,
  AuthUserRoleEntitySchema,
  ExternalIdentityEntity,
  ExternalIdentityEntitySchema,
  TransactionalOutboxEventEntity,
  TransactionalOutboxEventEntitySchema,
} from './index';

const invokeLifecycleHook = (hook: unknown): unknown => (hook as (() => unknown) | undefined)?.();

describe('entity timestamp lifecycle hooks', () => {
  it('drives created-only hooks for join, catalog, and log entities', () => {
    AdminAuditLogEntitySchema.init();
    AuthPermissionEntitySchema.init();
    AuthRolePermissionEntitySchema.init();
    AuthUserRoleEntitySchema.init();
    TransactionalOutboxEventEntitySchema.init();

    expect(invokeLifecycleHook(AdminAuditLogEntitySchema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeLifecycleHook(AuthPermissionEntitySchema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeLifecycleHook(AuthRolePermissionEntitySchema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeLifecycleHook(AuthUserRoleEntitySchema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeLifecycleHook(TransactionalOutboxEventEntitySchema.meta.properties.createdAt.onCreate)).toBeInstanceOf(
      Date,
    );
  });

  it('drives tenant lifecycle create/update hooks', () => {
    AuthTenantEntitySchema.init();
    AuthTenantMembershipEntitySchema.init();
    AuthTenantInvitationEntitySchema.init();

    for (const schema of [AuthTenantEntitySchema, AuthTenantMembershipEntitySchema, AuthTenantInvitationEntitySchema]) {
      expect(invokeLifecycleHook(schema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
      expect(invokeLifecycleHook(schema.meta.properties.updatedAt.onCreate)).toBeInstanceOf(Date);
      expect(invokeLifecycleHook(schema.meta.properties.updatedAt.onUpdate)).toBeInstanceOf(Date);
    }
  });

  it('drives token lifecycle create/update hooks', () => {
    AuthUserTokenEntitySchema.init();
    AuthLinkTokenEntitySchema.init();
    AuthProviderTokenEntitySchema.init();

    for (const schema of [AuthUserTokenEntitySchema, AuthLinkTokenEntitySchema, AuthProviderTokenEntitySchema]) {
      expect(invokeLifecycleHook(schema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
      expect(invokeLifecycleHook(schema.meta.properties.updatedAt.onCreate)).toBeInstanceOf(Date);
      expect(invokeLifecycleHook(schema.meta.properties.updatedAt.onUpdate)).toBeInstanceOf(Date);
    }
  });

  it('drives social-auth and role lifecycle create/update hooks', () => {
    ExternalIdentityEntitySchema.init();
    AuthMethodEntitySchema.init();
    AuthRoleEntitySchema.init();

    for (const schema of [ExternalIdentityEntitySchema, AuthMethodEntitySchema, AuthRoleEntitySchema]) {
      expect(invokeLifecycleHook(schema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
      expect(invokeLifecycleHook(schema.meta.properties.updatedAt.onCreate)).toBeInstanceOf(Date);
      expect(invokeLifecycleHook(schema.meta.properties.updatedAt.onUpdate)).toBeInstanceOf(Date);
    }
  });
});

describe('entity constructor and field-default coverage', () => {
  it('hydrates timestamp-token entities with default field initializers', () => {
    expect(new AuthUserTokenEntity().consumedAt).toBeNull();
    expect(new AuthMethodEntity()).toMatchObject({
      amr: [],
      externalIdentityId: null,
      lastUsedAt: null,
    });
    expect(new AuthLinkTokenEntity().nonce).toBeNull();
    expect(new AuthProviderTokenEntity()).toMatchObject({
      provider: 'discord',
      scopes: [],
      expiresAt: null,
      revokedAt: null,
    });
    expect(new ExternalIdentityEntity().displayName).toBeNull();
  });

  it('honours fully-populated audit-log input including explicit createdAt', () => {
    const createdAt = new Date('2026-07-01T00:00:00.000Z');
    const entity = new AdminAuditLogEntity({
      tenantId: '22222222-2222-4222-8222-222222222222',
      actorUserId: '33333333-3333-4333-8333-333333333333',
      action: 'admin.user.roles.update',
      resource: 'admin.users',
      targetUserId: '44444444-4444-4444-8444-444444444444',
      before: { roles: ['user'] },
      after: { roles: ['admin'] },
      metadata: { requestId: 'req-1' },
      createdAt,
    });

    expect(entity).toMatchObject({
      tenantId: '22222222-2222-4222-8222-222222222222',
      actorUserId: '33333333-3333-4333-8333-333333333333',
      before: { roles: ['user'] },
      after: { roles: ['admin'] },
      metadata: { requestId: 'req-1' },
      createdAt,
    });
    expect(new AdminAuditLogEntity()).toBeInstanceOf(AdminAuditLogEntity);
  });

  it('honours permission description input and empty hydration', () => {
    expect(
      new AuthPermissionEntity({
        key: 'admin:users:read',
        resource: 'admin.users',
        action: 'read',
        description: 'Read admin users',
      }).description,
    ).toBe('Read admin users');
    expect(new AuthPermissionEntity()).toBeInstanceOf(AuthPermissionEntity);
  });

  it('hydrates role/permission join rows empty for MikroORM', () => {
    expect(new AuthRolePermissionEntity()).toBeInstanceOf(AuthRolePermissionEntity);
  });

  it('honours fully-populated outbox input including explicit timestamps', () => {
    const createdAt = new Date('2026-07-01T00:00:00.000Z');
    const publishedAt = new Date('2026-07-01T00:05:00.000Z');
    const entity = new TransactionalOutboxEventEntity({
      tenantId: '22222222-2222-4222-8222-222222222222',
      aggregateType: 'admin.user',
      aggregateId: '44444444-4444-4444-8444-444444444444',
      eventType: 'admin.user.roles.update',
      payload: { auditLogId: 'log-1' },
      metadata: { requestId: 'req-1' },
      status: 'published',
      createdAt,
      publishedAt,
    });

    expect(entity).toMatchObject({
      status: 'published',
      payload: { auditLogId: 'log-1' },
      metadata: { requestId: 'req-1' },
      createdAt,
      publishedAt,
    });
    expect(new TransactionalOutboxEventEntity()).toBeInstanceOf(TransactionalOutboxEventEntity);
  });
});
