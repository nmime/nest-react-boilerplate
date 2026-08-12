/* eslint-disable no-await-in-loop -- collection/index creation and RBAC seeding are intentionally ordered */
import { randomUUID } from 'node:crypto';
import type { ClientSession, Db, Document, IndexDescription } from 'mongodb';
// Unlike the versioned Postgres migrations, this reconciler converges the database on every boot,
// so it binds to the *composed* catalog: permissions and roles a product registered through
// `productAuthzExtensions` are seeded here without the product writing a migration.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  permissionCatalog,
  permissionsForRoles,
  roleKeys,
} from '../../../../../../common/authz/lib/src/effective-catalog';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { DefaultAuthTenantId } from '../../../../../feature/auth/shared/lib/src/oauth/tenant-context';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { assertCollectionDefinition } from '../../../shared/lib/src/migrations/mongo-migration';

export const AuthMongoCollections = {
  users: 'auth_users',
  userTokens: 'auth_user_tokens',
  identities: 'auth_external_identities',
  methods: 'auth_methods',
  linkTokens: 'auth_link_tokens',
  providerTokens: 'auth_provider_tokens',
  roles: 'auth_roles',
  permissions: 'auth_permissions',
  rolePermissions: 'auth_role_permissions',
  userRoles: 'auth_user_roles',
  userPermissions: 'auth_user_permissions',
  auditLogs: 'admin_audit_logs',
  loginEvents: 'auth_login_events',
  presentations: 'problem_presentation_overrides',
  outbox: 'transactional_outbox_events',
  tenantLocks: 'auth_tenant_serialization',
} as const;

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const baseProperties = {
  _id: { bsonType: 'string', pattern: uuidPattern },
  tenantId: { bsonType: 'string', pattern: uuidPattern },
};
const validator = (required: string[], properties: Record<string, unknown>) => ({
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', ...required],
    properties: { ...baseProperties, ...properties },
  },
});
const text = { bsonType: 'string' } as const;
const date = { bsonType: 'date' } as const;
const nullableDate = { bsonType: ['date', 'null'] } as const;
const nullableText = { bsonType: ['string', 'null'] } as const;
const object = { bsonType: 'object' } as const;
const strings = { bsonType: 'array', items: text } as const;

export const AuthMongoCollectionDefinitions: Array<{
  name: string;
  validator: Document;
  indexes: IndexDescription[];
}> = [
  {
    name: AuthMongoCollections.users,
    validator: validator(
      [
        'tenantId',
        'email',
        'displayName',
        'passwordHash',
        'status',
        'locale',
        'theme',
        'lastLoginAt',
        'avatarUrl',
        'avatarHash',
        'avatarStatus',
        'createdAt',
        'updatedAt',
      ],
      {
        email: nullableText,
        displayName: text,
        passwordHash: text,
        status: { enum: ['active', 'disabled', 'invited'] },
        locale: text,
        theme: { enum: ['system', 'light', 'dark'] },
        lastLoginAt: date,
        avatarUrl: text,
        avatarHash: text,
        avatarStatus: { enum: ['none', 'provider', 'manual', 'deleted'] },
        // Deliberately not required: this validator also gates updates to documents that predate
        // account recovery, and those documents carry neither field.
        emailVerifiedAt: nullableDate,
        credentialRevision: { bsonType: ['int', 'long'] },
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      {
        name: 'uq__auth_users__tenant_id_email_not_null',
        key: { tenantId: 1, email: 1 },
        unique: true,
        partialFilterExpression: { email: { $type: 'string' } },
      },
      { name: 'ix__auth_users__tenant_id_created_at', key: { tenantId: 1, createdAt: -1 } },
    ],
  },
  {
    name: AuthMongoCollections.userTokens,
    validator: validator(
      ['tenantId', 'userId', 'purpose', 'tokenHash', 'expiresAt', 'consumedAt', 'createdAt', 'updatedAt'],
      {
        userId: text,
        purpose: { enum: ['email_verification', 'password_reset'] },
        tokenHash: text,
        expiresAt: date,
        consumedAt: nullableDate,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      { name: 'uq__auth_user_tokens__token_hash', key: { tokenHash: 1 }, unique: true },
      { name: 'ix__auth_user_tokens__tenant_user', key: { tenantId: 1, userId: 1 } },
      { name: 'ttl__auth_user_tokens__expires_at', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
  },
  {
    name: AuthMongoCollections.identities,
    validator: validator(
      [
        'tenantId',
        'userId',
        'provider',
        'providerSubject',
        'channel',
        'profileMetadata',
        'email',
        'emailVerified',
        'locale',
        'avatarUrl',
        'displayName',
        'username',
        'lastAuthenticatedAt',
        'linkedAt',
        'createdAt',
        'updatedAt',
      ],
      {
        userId: text,
        provider: { enum: ['telegram', 'discord'] },
        providerSubject: text,
        channel: text,
        profileMetadata: object,
        email: nullableText,
        emailVerified: { bsonType: ['bool', 'null'] },
        locale: nullableText,
        avatarUrl: nullableText,
        displayName: nullableText,
        username: nullableText,
        lastAuthenticatedAt: nullableDate,
        linkedAt: date,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      {
        name: 'uq__auth_external_identities__tenant_provider_subject',
        key: { tenantId: 1, provider: 1, providerSubject: 1 },
        unique: true,
      },
      { name: 'ix__auth_external_identities__tenant_user', key: { tenantId: 1, userId: 1, linkedAt: 1 } },
    ],
  },
  {
    name: AuthMongoCollections.methods,
    validator: validator(
      ['tenantId', 'userId', 'method', 'amr', 'externalIdentityId', 'lastUsedAt', 'createdAt', 'updatedAt'],
      {
        userId: text,
        method: {
          enum: ['password', 'telegram_oidc', 'telegram_tma', 'telegram_bot', 'discord_oauth', 'discord_bot'],
        },
        amr: strings,
        externalIdentityId: nullableText,
        lastUsedAt: nullableDate,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      {
        name: 'uq__auth_methods__tenant_user_method_identity',
        key: { tenantId: 1, userId: 1, method: 1, externalIdentityId: 1 },
        unique: true,
      },
      { name: 'ix__auth_methods__tenant_user_last_used', key: { tenantId: 1, userId: 1, lastUsedAt: -1 } },
    ],
  },
  {
    name: AuthMongoCollections.linkTokens,
    validator: validator(
      [
        'tenantId',
        'userId',
        'provider',
        'purpose',
        'tokenHash',
        'nonce',
        'deepLinkMetadata',
        'expiresAt',
        'consumedAt',
        'revokedAt',
        'createdAt',
        'updatedAt',
      ],
      {
        userId: nullableText,
        provider: { enum: ['telegram', 'discord'] },
        purpose: { enum: ['login', 'link'] },
        tokenHash: text,
        nonce: nullableText,
        deepLinkMetadata: object,
        expiresAt: date,
        consumedAt: nullableDate,
        revokedAt: nullableDate,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      { name: 'uq__auth_link_tokens__token_hash', key: { tokenHash: 1 }, unique: true },
      { name: 'ix__auth_link_tokens__tenant_user', key: { tenantId: 1, userId: 1 } },
      { name: 'ttl__auth_link_tokens__expires_at', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
  },
  {
    name: AuthMongoCollections.providerTokens,
    validator: validator(
      [
        'tenantId',
        'userId',
        'externalIdentityId',
        'provider',
        'tokenKind',
        'ciphertext',
        'iv',
        'authTag',
        'keyId',
        'scopes',
        'expiresAt',
        'revokedAt',
        'createdAt',
        'updatedAt',
      ],
      {
        userId: text,
        externalIdentityId: text,
        provider: { enum: ['telegram', 'discord'] },
        tokenKind: { enum: ['access', 'refresh'] },
        ciphertext: text,
        iv: text,
        authTag: text,
        keyId: text,
        scopes: strings,
        expiresAt: nullableDate,
        revokedAt: nullableDate,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      { name: 'ix__auth_provider_tokens__tenant_identity', key: { tenantId: 1, externalIdentityId: 1, createdAt: -1 } },
      { name: 'ix__auth_provider_tokens__expires_at', key: { expiresAt: 1 } },
    ],
  },
  {
    name: AuthMongoCollections.roles,
    validator: validator(['tenantId', 'key', 'label', 'description', 'isSystem', 'createdAt', 'updatedAt'], {
      key: text,
      label: text,
      description: text,
      isSystem: { bsonType: 'bool' },
      createdAt: date,
      updatedAt: date,
    }),
    indexes: [{ name: 'uq__auth_roles__tenant_key', key: { tenantId: 1, key: 1 }, unique: true }],
  },
  {
    name: AuthMongoCollections.permissions,
    validator: validator(['key', 'resource', 'action', 'description', 'createdAt'], {
      tenantId: { bsonType: ['string', 'null'] },
      key: text,
      resource: text,
      action: text,
      description: text,
      createdAt: date,
    }),
    indexes: [
      { name: 'uq__auth_permissions__key', key: { key: 1 }, unique: true },
      { name: 'ix__auth_permissions__resource_action', key: { resource: 1, action: 1 } },
    ],
  },
  {
    name: AuthMongoCollections.rolePermissions,
    validator: validator(['roleId', 'permissionId', 'managed', 'createdAt'], {
      tenantId: { bsonType: ['string', 'null'] },
      roleId: text,
      permissionId: text,
      managed: { bsonType: 'bool' },
      createdAt: date,
    }),
    indexes: [
      { name: 'uq__auth_role_permissions__role_permission', key: { roleId: 1, permissionId: 1 }, unique: true },
      { name: 'ix__auth_role_permissions__permission', key: { permissionId: 1 } },
    ],
  },
  {
    name: AuthMongoCollections.userRoles,
    validator: validator(['tenantId', 'userId', 'roleId', 'grantedByUserId', 'createdAt'], {
      userId: text,
      roleId: text,
      grantedByUserId: nullableText,
      createdAt: date,
    }),
    indexes: [
      { name: 'uq__auth_user_roles__tenant_user_role', key: { tenantId: 1, userId: 1, roleId: 1 }, unique: true },
      { name: 'ix__auth_user_roles__tenant_role', key: { tenantId: 1, roleId: 1 } },
    ],
  },
  {
    name: AuthMongoCollections.userPermissions,
    validator: validator(['tenantId', 'userId', 'permissionId', 'grantedByUserId', 'createdAt'], {
      userId: text,
      permissionId: text,
      grantedByUserId: nullableText,
      createdAt: date,
    }),
    indexes: [
      {
        name: 'uq__auth_user_permissions__tenant_user_permission',
        key: { tenantId: 1, userId: 1, permissionId: 1 },
        unique: true,
      },
    ],
  },
  {
    name: AuthMongoCollections.auditLogs,
    validator: validator(
      ['tenantId', 'actorUserId', 'action', 'resource', 'targetUserId', 'before', 'after', 'metadata', 'createdAt'],
      {
        actorUserId: nullableText,
        action: text,
        resource: text,
        targetUserId: nullableText,
        before: object,
        after: object,
        metadata: object,
        createdAt: date,
      },
    ),
    indexes: [
      { name: 'ix__admin_audit_logs__tenant_created', key: { tenantId: 1, createdAt: -1, _id: -1 } },
      { name: 'ix__admin_audit_logs__tenant_action', key: { tenantId: 1, action: 1 } },
      { name: 'ix__admin_audit_logs__tenant_resource_created', key: { tenantId: 1, resource: 1, createdAt: -1 } },
    ],
  },
  {
    name: AuthMongoCollections.loginEvents,
    validator: validator(
      [
        'tenantId',
        'userId',
        'identifierHash',
        'sessionId',
        'eventType',
        'outcome',
        'provider',
        'channel',
        'failureCode',
        'ipAddress',
        'ipHash',
        'countryCode',
        'region',
        'city',
        'timezone',
        'timezoneSource',
        'language',
        'languageSource',
        'userAgent',
        'requestId',
        'occurredAt',
        'networkAnonymizedAt',
      ],
      {
        userId: nullableText,
        identifierHash: nullableText,
        sessionId: nullableText,
        eventType: { enum: ['login', 'registration'] },
        outcome: { enum: ['success', 'failure'] },
        provider: text,
        channel: text,
        failureCode: nullableText,
        ipAddress: nullableText,
        ipHash: nullableText,
        countryCode: nullableText,
        region: nullableText,
        city: nullableText,
        timezone: nullableText,
        timezoneSource: nullableText,
        language: nullableText,
        languageSource: nullableText,
        userAgent: nullableText,
        requestId: nullableText,
        occurredAt: date,
        networkAnonymizedAt: nullableDate,
      },
    ),
    indexes: [
      { name: 'ix__auth_login_events__tenant_occurred', key: { tenantId: 1, occurredAt: -1 } },
      { name: 'ix__auth_login_events__tenant_user_occurred', key: { tenantId: 1, userId: 1, occurredAt: -1 } },
      { name: 'ix__auth_login_events__tenant_outcome_occurred', key: { tenantId: 1, outcome: 1, occurredAt: -1 } },
    ],
  },
  {
    name: AuthMongoCollections.presentations,
    validator: validator(
      [
        'tenantId',
        'ruleId',
        'display',
        'severity',
        'comment',
        'messageEn',
        'messageRu',
        'revision',
        'updatedByUserId',
        'createdAt',
        'updatedAt',
      ],
      {
        ruleId: text,
        display: { enum: ['toast', 'silent'] },
        severity: { enum: ['error', 'warning', 'info', 'success'] },
        comment: text,
        messageEn: text,
        messageRu: text,
        revision: { bsonType: 'int', minimum: 1 },
        updatedByUserId: text,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [{ name: 'uq__problem_presentations__tenant_rule', key: { tenantId: 1, ruleId: 1 }, unique: true }],
  },
  {
    name: AuthMongoCollections.outbox,
    validator: validator(
      [
        'tenantId',
        'aggregateType',
        'aggregateId',
        'eventType',
        'payload',
        'metadata',
        'status',
        'createdAt',
        'publishedAt',
      ],
      {
        aggregateType: text,
        aggregateId: text,
        eventType: text,
        payload: object,
        metadata: object,
        status: { enum: ['pending', 'published', 'failed'] },
        createdAt: date,
        publishedAt: nullableDate,
      },
    ),
    indexes: [
      { name: 'ix__outbox__tenant_status_created', key: { tenantId: 1, status: 1, createdAt: 1 } },
      { name: 'ix__outbox__tenant_aggregate', key: { tenantId: 1, aggregateType: 1, aggregateId: 1 } },
    ],
  },
  {
    name: AuthMongoCollections.tenantLocks,
    validator: validator(['tenantId', 'revision', 'updatedAt'], {
      revision: { bsonType: ['int', 'long'] },
      updatedAt: date,
    }),
    indexes: [{ name: 'uq__auth_tenant_serialization__tenant', key: { tenantId: 1 }, unique: true }],
  },
];

export async function initializeMongoAuthPersistence(database: Db): Promise<void> {
  for (const definition of AuthMongoCollectionDefinitions) {
    try {
      await database.createCollection(definition.name, {
        validator: definition.validator,
        validationAction: 'error',
        validationLevel: 'strict',
      });
    } catch (error) {
      if (!isNamespaceExistsError(error)) {
        throw error;
      }
      await database.command({
        collMod: definition.name,
        validator: definition.validator,
        validationAction: 'error',
        validationLevel: 'strict',
      });
    }
    await database.collection(definition.name).createIndexes(definition.indexes);
  }
  await seedRbac(database);
}

export async function verifyMongoAuthPersistence(database: Db): Promise<void> {
  for (const definition of AuthMongoCollectionDefinitions) {
    await assertCollectionDefinition(database, definition);
  }
  await verifyRbac(database);
}

async function seedRbac(database: Db): Promise<void> {
  const now = new Date();
  const permissions = database.collection(AuthMongoCollections.permissions);
  for (const permission of permissionCatalog) {
    await permissions.updateOne(
      { key: permission.key },
      {
        $set: { resource: permission.resource, action: permission.action, description: permission.description },
        $setOnInsert: { _id: randomUUID(), key: permission.key, createdAt: now },
      },
      { upsert: true },
    );
  }
  const roles = database.collection(AuthMongoCollections.roles);
  for (const key of roleKeys) {
    const role = await roles.findOneAndUpdate(
      { tenantId: DefaultAuthTenantId, key },
      {
        $setOnInsert: {
          _id: randomUUID(),
          tenantId: DefaultAuthTenantId,
          key,
          label: key,
          description: '',
          isSystem: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: false },
    );
    if (!role) {
      throw new Error('MongoDB RBAC role initialization failed.');
    }
    await reconcileManagedRolePermissions(database, String(role._id), permissionsForRoles([key]), now);
  }
}

async function verifyRbac(database: Db): Promise<void> {
  const permissions = database.collection(AuthMongoCollections.permissions);
  const permissionIds = new Map<string, unknown>();
  for (const expected of permissionCatalog) {
    const permission = await permissions.findOne({ key: expected.key });
    if (
      permission === null ||
      permission.resource !== expected.resource ||
      permission.action !== expected.action ||
      permission.description !== expected.description
    ) {
      throw new Error(`MongoDB RBAC permission ${expected.key} is missing or incompatible.`);
    }
    permissionIds.set(expected.key, permission._id);
  }

  const roles = database.collection(AuthMongoCollections.roles);
  const grants = database.collection(AuthMongoCollections.rolePermissions);
  for (const key of roleKeys) {
    const role = await roles.findOne({ tenantId: DefaultAuthTenantId, key });
    if (role === null || role.isSystem !== true) {
      throw new Error(`MongoDB RBAC role ${key} is missing or incompatible.`);
    }
    const expectedGrantIds = new Set(
      permissionsForRoles([key]).map((permissionKey) => permissionIds.get(permissionKey)),
    );
    const managedGrants = await grants.find({ roleId: role._id, managed: true }).toArray();
    if (
      expectedGrantIds.has(undefined) ||
      managedGrants.length !== expectedGrantIds.size ||
      managedGrants.some((grant) => !expectedGrantIds.has(grant.permissionId))
    ) {
      throw new Error(`MongoDB RBAC grants for ${key} are missing or incompatible.`);
    }
  }
}

export async function reconcileManagedRolePermissions(
  database: Db,
  roleId: string,
  permissionKeys: readonly string[],
  now: Date,
  session?: ClientSession,
): Promise<void> {
  const permissions = await database
    .collection(AuthMongoCollections.permissions)
    .find({ key: { $in: [...permissionKeys] } }, { session })
    .toArray();
  if (permissions.length !== permissionKeys.length) {
    throw new Error(`MongoDB RBAC permissions for role ${roleId} are missing.`);
  }
  const grants = database.collection(AuthMongoCollections.rolePermissions);
  for (const permission of permissions) {
    await grants.updateOne(
      { roleId, permissionId: permission._id },
      {
        $set: { managed: true },
        $setOnInsert: { _id: randomUUID(), roleId, permissionId: permission._id, createdAt: now },
      },
      { upsert: true, session },
    );
  }
  await grants.deleteMany(
    { roleId, managed: true, permissionId: { $nin: permissions.map((permission) => permission._id) } },
    { session },
  );
}

const isNamespaceExistsError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 48;
