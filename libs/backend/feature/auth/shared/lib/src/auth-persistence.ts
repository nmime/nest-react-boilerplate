import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Locale } from '@app/backend-common-i18n';
import type { ProblemPresentationDisplay, ProblemPresentationSeverity } from '@app/common-problem-details';
import type { ResultAsync } from 'neverthrow';
import type { ExternalAuthProvider, ExternalAuthProviderChannel } from './oauth/social-auth.types';

export type AuthUserThemePreference = 'system' | 'light' | 'dark';
export type AuthUserStatus = 'active' | 'disabled' | 'invited';
export type AuthUserAvatarStatus = 'none' | 'provider' | 'manual' | 'deleted';
export type AuthPersistenceUserTokenPurpose = 'email_verification' | 'password_reset';
export type AuthLinkTokenPurpose = 'login' | 'link';
export type AuthMethodType = 'password' | ExternalAuthProviderChannel;
export type AuthProviderTokenKind = 'access' | 'refresh';
export type AuthLoginEventType = 'login' | 'registration';
export type AuthLoginOutcome = 'success' | 'failure';
export type TransactionalOutboxEventStatus = 'pending' | 'published' | 'failed';

export interface AuthRepositoryError {
  code: 'repository_error';
  message: string;
}

export interface ProblemPresentationRepositoryError {
  code: 'repository_error' | 'revision_conflict';
  message: string;
}

export interface BetterAuthDatabaseProvider {
  readonly database: unknown;
}

export const BetterAuthDatabaseProviderInjectToken = Symbol('BetterAuthDatabaseProviderInjectToken');

export interface AuthUserAccessPolicyInput {
  permissions?: string[];
  roles?: string[];
  status?: AuthUserStatus;
}

export interface AuthUserPersistenceRecord extends Required<AuthUserAccessPolicyInput> {
  id: string;
  tenantId: string;
  email: string | null;
  displayName: string;
  passwordHash: string;
  locale: Locale;
  theme: AuthUserThemePreference;
  lastLoginAt: Date;
  avatarUrl: string;
  avatarHash: string;
  avatarStatus: AuthUserAvatarStatus;
  createdAt: Date;
  updatedAt: Date;
  // Optional so an adapter written before account recovery existed still satisfies the record
  // contract. `toAuthUserRecord` is the single place that resolves the absent value to the
  // safe default (never verified, revision zero).
  emailVerifiedAt?: Date | null;
  credentialRevision?: number;
}

export interface AuthUserCreateInput extends AuthUserAccessPolicyInput {
  tenantId?: string;
  email: string | null;
  displayName?: string | null;
  passwordHash?: string;
  locale?: Locale | null;
  theme?: AuthUserThemePreference | null;
  lastLoginAt?: Date | null;
  avatarUrl?: string | null;
  avatarHash?: string | null;
  avatarStatus?: AuthUserAvatarStatus | null;
}

export interface AuthUserListInput {
  tenantId?: string;
  search?: string;
  status?: AuthUserStatus;
  role?: string;
  permission?: string;
  locale?: Locale;
  createdAfter?: Date;
  createdBefore?: Date;
  lastLoginAfter?: Date;
  lastLoginBefore?: Date;
  limit?: number;
  offset?: number;
}

export interface AuthUserRepositoryPort {
  createUser(input: AuthUserCreateInput): ResultAsync<AuthUserPersistenceRecord, AuthRepositoryError>;
  findByEmail(
    email: string | null | undefined,
    tenantId?: string,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError>;
  findById(id: string, tenantId?: string): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError>;
  listUsers(input?: AuthUserListInput): ResultAsync<AuthUserPersistenceRecord[], AuthRepositoryError>;
  countUsers(input?: AuthUserListInput): ResultAsync<number, AuthRepositoryError>;
  setLocale(
    id: string,
    locale: Locale,
    tenantId?: string,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError>;
  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: AuthUserThemePreference },
    tenantId?: string,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError>;
  recordLogin(
    id: string,
    loggedInAt?: Date,
    tenantId?: string,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError>;
  setAvatar(
    id: string,
    input: { url: string; hash: string; status: AuthUserAvatarStatus },
    tenantId?: string,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError>;
  deleteAvatar(id: string, tenantId?: string): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError>;
  syncProviderAvatar(
    id: string,
    input: { url: string | null; hash: string | null },
    tenantId?: string,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError>;
  verifyEmail(
    id: string,
    tenantId?: string,
    verifiedAt?: Date,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError>;
  /**
   * Replaces the stored credential and advances `credentialRevision` in the same write.
   *
   * The counter is the session epoch every access guard compares against, so the two must move
   * together or a reset leaves previously issued sessions usable.
   */
  replacePassword(
    id: string,
    passwordHash: string,
    tenantId?: string,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError>;
}

export interface AuthUserTokenRecord {
  id: string;
  tenantId: string;
  userId: string;
  purpose: AuthPersistenceUserTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersistAuthUserTokenInput {
  id: string;
  tenantId?: string;
  userId: string;
  purpose: AuthPersistenceUserTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
}

export interface AuthTokenRepositoryPort {
  createUserToken(input: PersistAuthUserTokenInput): ResultAsync<AuthUserTokenRecord, AuthRepositoryError>;
  consumeUserToken(
    tokenHash: string,
    purpose: AuthPersistenceUserTokenPurpose,
    tenantId?: string,
    now?: Date,
  ): ResultAsync<AuthUserTokenRecord | null, AuthRepositoryError>;
  cleanupExpiredTokens(before?: Date): ResultAsync<{ userTokensDeleted: number }, AuthRepositoryError>;
}

export interface ExternalIdentityPersistenceRecord {
  id: string;
  tenantId: string;
  userId: string;
  provider: ExternalAuthProvider;
  providerSubject: string;
  channel: ExternalAuthProviderChannel;
  profileMetadata: Record<string, unknown>;
  email: string | null;
  emailVerified: boolean | null;
  locale: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  username: string | null;
  lastAuthenticatedAt: Date | null;
  linkedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertExternalIdentityInput {
  tenantId?: string;
  userId: string;
  provider: ExternalAuthProvider;
  providerSubject: string;
  channel: ExternalAuthProviderChannel;
  profileMetadata?: Record<string, unknown>;
  email?: string | null;
  emailVerified?: boolean | null;
  locale?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  username?: string | null;
  lastAuthenticatedAt?: Date | null;
  linkedAt?: Date;
}

export interface ExternalIdentityRepositoryPort {
  upsertIdentity(
    input: UpsertExternalIdentityInput,
  ): ResultAsync<ExternalIdentityPersistenceRecord, AuthRepositoryError>;
  findByProviderSubject(
    provider: ExternalAuthProvider,
    providerSubject: string,
    tenantId?: string,
  ): ResultAsync<ExternalIdentityPersistenceRecord | null, AuthRepositoryError>;
  findByUser(userId: string, tenantId?: string): ResultAsync<ExternalIdentityPersistenceRecord[], AuthRepositoryError>;
  deleteById(id: string, userId: string, tenantId?: string): ResultAsync<boolean, AuthRepositoryError>;
}

export interface AuthMethodPersistenceRecord {
  id: string;
  tenantId: string;
  userId: string;
  method: AuthMethodType;
  amr: string[];
  externalIdentityId: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertAuthMethodInput {
  tenantId?: string;
  userId: string;
  method: AuthMethodType;
  amr?: string[];
  externalIdentityId?: string | null;
  lastUsedAt?: Date | null;
}

export interface AuthMethodRepositoryPort {
  upsertMethod(input: UpsertAuthMethodInput): ResultAsync<AuthMethodPersistenceRecord, AuthRepositoryError>;
  recordLastUsed(
    id: string,
    tenantId?: string,
    lastUsedAt?: Date,
  ): ResultAsync<AuthMethodPersistenceRecord | null, AuthRepositoryError>;
  findByUser(userId: string, tenantId?: string): ResultAsync<AuthMethodPersistenceRecord[], AuthRepositoryError>;
  findLastUsedByUser(
    userId: string,
    tenantId?: string,
  ): ResultAsync<AuthMethodPersistenceRecord | null, AuthRepositoryError>;
  countUsableMethodsForUser(userId: string, tenantId?: string): ResultAsync<number, AuthRepositoryError>;
}

export interface AuthLinkTokenRecord {
  id: string;
  tenantId: string;
  userId: string | null;
  provider: ExternalAuthProvider;
  purpose: AuthLinkTokenPurpose;
  tokenHash: string;
  nonce: string | null;
  deepLinkMetadata: Record<string, unknown>;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAuthLinkTokenInput {
  id?: string;
  tenantId?: string;
  userId?: string | null;
  provider: ExternalAuthProvider;
  purpose: AuthLinkTokenPurpose;
  tokenHash: string;
  nonce?: string | null;
  deepLinkMetadata?: Record<string, unknown>;
  expiresAt: Date;
}

export interface AuthLinkTokenRepositoryPort {
  createToken(input: CreateAuthLinkTokenInput): ResultAsync<AuthLinkTokenRecord, AuthRepositoryError>;
  consumeToken(
    tokenHash: string,
    purpose: AuthLinkTokenPurpose,
    tenantId?: string,
    now?: Date,
  ): ResultAsync<AuthLinkTokenRecord | null, AuthRepositoryError>;
  revokeToken(tokenHash: string, tenantId?: string, now?: Date): ResultAsync<boolean, AuthRepositoryError>;
}

export interface ProviderTokenCiphertext {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
}

export interface ProviderTokenCrypto {
  encrypt(input: { plaintext: string; aad?: string }): ProviderTokenCiphertext;
  decrypt(input: ProviderTokenCiphertext & { aad?: string }): string;
}

export class NodeAesGcmProviderTokenCrypto implements ProviderTokenCrypto {
  constructor(private readonly keyResolver: () => { keyId: string; key: Buffer }) {}

  encrypt(input: { plaintext: string; aad?: string }): ProviderTokenCiphertext {
    const { keyId, key } = this.keyResolver();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    if (input.aad) {
      cipher.setAAD(Buffer.from(input.aad, 'utf8'));
    }
    const ciphertext = Buffer.concat([cipher.update(input.plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyId,
    };
  }

  decrypt(input: ProviderTokenCiphertext & { aad?: string }): string {
    const { key } = this.keyResolver();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(input.iv, 'base64'));
    if (input.aad) {
      decipher.setAAD(Buffer.from(input.aad, 'utf8'));
    }
    decipher.setAuthTag(Buffer.from(input.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(input.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }
}

export interface AuthProviderTokenRecord extends ProviderTokenCiphertext {
  id: string;
  tenantId: string;
  userId: string;
  externalIdentityId: string;
  provider: ExternalAuthProvider;
  tokenKind: AuthProviderTokenKind;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RedactedAuthProviderTokenView = Omit<
  AuthProviderTokenRecord,
  'ciphertext' | 'iv' | 'authTag' | 'createdAt' | 'updatedAt'
> & { redacted: true };
export interface PersistAuthProviderTokenInput extends ProviderTokenCiphertext {
  tenantId?: string;
  userId: string;
  externalIdentityId: string;
  provider?: ExternalAuthProvider;
  tokenKind: AuthProviderTokenKind;
  scopes?: string[];
  expiresAt?: Date | null;
}

export interface AuthProviderTokenRepositoryPort {
  persistEncryptedToken(
    input: PersistAuthProviderTokenInput,
  ): ResultAsync<AuthProviderTokenRecord, AuthRepositoryError>;
  listRedactedByExternalIdentity(
    externalIdentityId: string,
    tenantId?: string,
  ): ResultAsync<RedactedAuthProviderTokenView[], AuthRepositoryError>;
  revokeToken(
    id: string,
    tenantId?: string,
    revokedAt?: Date,
  ): ResultAsync<AuthProviderTokenRecord | null, AuthRepositoryError>;
}

export interface AuthRoleRecord {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  description: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthPermissionRecord {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string;
  createdAt: Date;
}

export interface AuthRoleWithPermissions {
  role: AuthRoleRecord;
  permissionKeys: string[];
}
export interface AuthRoleRepositoryPort {
  findByKey(
    key: string,
    tenantId?: string,
    transaction?: unknown,
  ): ResultAsync<AuthRoleRecord | null, AuthRepositoryError>;
  findByKeys(
    keys: readonly string[],
    tenantId?: string,
    transaction?: unknown,
  ): ResultAsync<AuthRoleRecord[], AuthRepositoryError>;
  findById(
    id: string,
    tenantId?: string,
    transaction?: unknown,
  ): ResultAsync<AuthRoleRecord | null, AuthRepositoryError>;
  listPermissions(transaction?: unknown): ResultAsync<AuthPermissionRecord[], AuthRepositoryError>;
  findPermissionsByKeys(
    keys: readonly string[],
    transaction?: unknown,
  ): ResultAsync<AuthPermissionRecord[], AuthRepositoryError>;
  listRolesWithPermissions(
    tenantId?: string,
    transaction?: unknown,
  ): ResultAsync<AuthRoleWithPermissions[], AuthRepositoryError>;
  createRole(
    input: { tenantId?: string; key: string; label?: string; description?: string; isSystem?: boolean },
    transaction?: unknown,
  ): ResultAsync<AuthRoleRecord, AuthRepositoryError>;
  updateRole(
    id: string,
    input: { label?: string; description?: string },
    tenantId?: string,
    transaction?: unknown,
  ): ResultAsync<AuthRoleRecord | null, AuthRepositoryError>;
  setRolePermissions(
    id: string,
    permissionKeys: readonly string[],
    tenantId?: string,
    actorUserId?: string,
    transaction?: unknown,
  ): ResultAsync<AuthRoleWithPermissions | null, AuthRepositoryError>;
}

export interface AuthUserRoleRepositoryPort {
  assignRoles(input: {
    userId: string;
    tenantId?: string;
    roleKeys: readonly string[];
    grantedByUserId?: string | null;
  }): ResultAsync<string[], AuthRepositoryError>;
  listRoleKeys(userId: string, tenantId?: string): ResultAsync<string[], AuthRepositoryError>;
  resolveEffectiveAccess(
    userId: string,
    tenantId?: string,
  ): ResultAsync<{ roleKeys: string[]; permissionKeys: string[] }, AuthRepositoryError>;
}

export const AdminAuditActions = [
  'admin.access',
  'admin.role.create',
  'admin.role.update',
  'admin.role.permissions.update',
  'admin.user.status.update',
  'admin.user.access_policy.update',
  'admin.user.roles.update',
  'admin.problem_presentation.update',
  'admin.problem_presentation.reset',
  'admin.notification_template.create',
  'admin.notification_template.update',
  'admin.notification_template.publish',
  'admin.notification_template.archive',
  'admin.notification_template.test_send',
  'admin.notification_segment.create',
  'admin.notification_segment.update',
  'admin.notification_segment.upload',
  'admin.notification_segment.archive',
  'admin.notification_broadcast.create',
  'admin.notification_broadcast.update',
  'admin.notification_broadcast.command',
  'admin.feature_flag.upsert',
] as const;
export type AdminAuditAction = (typeof AdminAuditActions)[number];
export interface AdminAuditLogInput {
  tenantId?: string;
  actorUserId?: string | null;
  action: AdminAuditAction;
  resource: string;
  targetUserId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}
export interface AdminAuditLogRecord {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  action: string;
  resource: string;
  targetUserId: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
export interface AdminAuditLogListInput {
  tenantId?: string;
  action?: string;
  resource?: string;
  actorUserId?: string;
  targetUserId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  limit?: number;
  offset?: number;
}
export class AdminAuditLogTransactionError extends Error {
  constructor(cause: unknown) {
    super('Admin audit transaction failed.', { cause });
    this.name = 'AdminAuditLogTransactionError';
  }
}
export interface AdminAuditLogRepositoryPort {
  record(input: AdminAuditLogInput): ResultAsync<AdminAuditLogRecord, AuthRepositoryError>;
  recordTransactionally<T>(input: {
    operation: (transaction: unknown) => Promise<T>;
    audit: (result: T) => AdminAuditLogInput;
  }): Promise<T>;
  list(input?: AdminAuditLogListInput): ResultAsync<AdminAuditLogRecord[], AuthRepositoryError>;
  count(input?: AdminAuditLogListInput): ResultAsync<number, AuthRepositoryError>;
  findById(id: string, tenantId?: string): ResultAsync<AdminAuditLogRecord | null, AuthRepositoryError>;
}

export interface TransactionalOutboxRecord {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: TransactionalOutboxEventStatus;
  createdAt: Date;
  publishedAt: Date | null;
}
export type AdminUserMutationAction =
  'admin.user.status.update' | 'admin.user.access_policy.update' | 'admin.user.roles.update';
export interface AdminUserMutationResult {
  before: AuthUserPersistenceRecord;
  after: AuthUserPersistenceRecord;
  auditLog: AdminAuditLogRecord;
  outboxEvent: TransactionalOutboxRecord;
}
export interface AdminUserMutationRepositoryPort {
  mutateAccessPolicyWithAudit(input: {
    tenantId?: string;
    targetUserId: string;
    actorUserId: string;
    policy: AuthUserAccessPolicyInput;
    audit: { actorUserId?: string | null; metadata?: Record<string, unknown> | null };
    action: AdminUserMutationAction;
  }): ResultAsync<AdminUserMutationResult | null, AuthRepositoryError>;
  mutateUserRolesWithAudit(input: {
    tenantId?: string;
    targetUserId: string;
    actorUserId: string;
    desiredRoleKeys: readonly string[];
    audit: { actorUserId?: string | null; metadata?: Record<string, unknown> | null };
  }): ResultAsync<AdminUserMutationResult | null, AuthRepositoryError>;
}

export interface AuthLoginEventInput {
  tenantId?: string;
  userId?: string | null;
  identifierHash?: string | null;
  sessionId?: string | null;
  eventType: AuthLoginEventType;
  outcome: AuthLoginOutcome;
  provider: string;
  channel: string;
  failureCode?: string | null;
  ipAddress?: string | null;
  ipHash?: string | null;
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
  timezone?: string | null;
  timezoneSource?: string | null;
  language?: string | null;
  languageSource?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  occurredAt?: Date;
  networkAnonymizedAt?: Date | null;
}
export interface AuthLoginEventRecord extends Required<Omit<AuthLoginEventInput, 'tenantId' | 'occurredAt'>> {
  id: string;
  tenantId: string;
  occurredAt: Date;
}
export interface AuthLoginEventListInput {
  tenantId?: string;
  userId?: string;
  outcome?: AuthLoginOutcome;
  provider?: string;
  countryCode?: string;
  language?: string;
  timezone?: string;
  occurredFrom?: Date;
  occurredTo?: Date;
  limit?: number;
  offset?: number;
}
export interface AuthLoginAnalyticsSummary {
  total: number;
  successful: number;
  failed: number;
  uniqueUsers: number;
  successRate: number;
  byCountry: Array<{ key: string; count: number }>;
  byLanguage: Array<{ key: string; count: number }>;
  byTimezone: Array<{ key: string; count: number }>;
  byProvider: Array<{ key: string; count: number }>;
}
export interface AuthLoginEventRepositoryPort {
  record(input: AuthLoginEventInput): ResultAsync<AuthLoginEventRecord, AuthRepositoryError>;
  list(input?: AuthLoginEventListInput): ResultAsync<AuthLoginEventRecord[], AuthRepositoryError>;
  count(input?: AuthLoginEventListInput): ResultAsync<number, AuthRepositoryError>;
  summary(input?: AuthLoginEventListInput): ResultAsync<AuthLoginAnalyticsSummary, AuthRepositoryError>;
  applyRetention(input: {
    tenantId?: string;
    anonymizeBefore: Date;
    deleteBefore: Date;
    now?: Date;
  }): Promise<{ anonymized: number; deleted: number }>;
}

export interface ProblemPresentationRecord {
  id: string;
  tenantId: string;
  ruleId: string;
  display: ProblemPresentationDisplay;
  severity: ProblemPresentationSeverity;
  comment: string;
  messageEn: string;
  messageRu: string;
  revision: number;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface SaveProblemPresentationInput {
  tenantId?: string;
  ruleId: string;
  display: ProblemPresentationDisplay;
  severity: ProblemPresentationSeverity;
  comment?: string;
  messageEn?: string;
  messageRu?: string;
  expectedRevision: number;
  actorUserId: string;
  metadata?: Record<string, unknown>;
}
export interface ResetProblemPresentationInput {
  tenantId?: string;
  ruleId: string;
  expectedRevision: number;
  actorUserId: string;
  metadata?: Record<string, unknown>;
}
export interface ProblemPresentationRepositoryPort {
  list(tenantId?: string): ResultAsync<ProblemPresentationRecord[], ProblemPresentationRepositoryError>;
  save(input: SaveProblemPresentationInput): ResultAsync<ProblemPresentationRecord, ProblemPresentationRepositoryError>;
  reset(input: ResetProblemPresentationInput): ResultAsync<boolean, ProblemPresentationRepositoryError>;
}

export const AuthUserRepositoryInjectToken = Symbol('AuthUserRepositoryInjectToken');
export const AuthTokenRepositoryInjectToken = Symbol('AuthTokenRepositoryInjectToken');
export const ExternalIdentityRepositoryInjectToken = Symbol('ExternalIdentityRepositoryInjectToken');
export const AuthMethodRepositoryInjectToken = Symbol('AuthMethodRepositoryInjectToken');
export const AuthLinkTokenRepositoryInjectToken = Symbol('AuthLinkTokenRepositoryInjectToken');
export const AuthProviderTokenRepositoryInjectToken = Symbol('AuthProviderTokenRepositoryInjectToken');
export const AuthRoleRepositoryInjectToken = Symbol('AuthRoleRepositoryInjectToken');
export const AuthUserRoleRepositoryInjectToken = Symbol('AuthUserRoleRepositoryInjectToken');
export const AdminAuditLogRepositoryInjectToken = Symbol('AdminAuditLogRepositoryInjectToken');
export const AdminUserMutationRepositoryInjectToken = Symbol('AdminUserMutationRepositoryInjectToken');
export const AuthLoginEventRepositoryInjectToken = Symbol('AuthLoginEventRepositoryInjectToken');
export const ProblemPresentationRepositoryInjectToken = Symbol('ProblemPresentationRepositoryInjectToken');
