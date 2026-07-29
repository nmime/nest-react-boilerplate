import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import {
  AdminAuditLogRepositoryInjectToken,
  AdminUserMutationRepositoryInjectToken,
  AuthLinkTokenRepositoryInjectToken,
  AuthLoginEventRepositoryInjectToken,
  AuthMethodRepositoryInjectToken,
  AuthProviderTokenRepositoryInjectToken,
  AuthRoleRepositoryInjectToken,
  AuthTokenRepositoryInjectToken,
  AuthUserRepositoryInjectToken,
  AuthUserRoleRepositoryInjectToken,
  ExternalIdentityRepositoryInjectToken,
  ProblemPresentationRepositoryInjectToken,
  BetterAuthDatabaseProviderInjectToken,
  type BetterAuthDatabaseProvider,
} from '@app/backend-feature-auth-shared';
import { AuthTokenCleanupService } from './auth-token-cleanup.service';
import {
  AdminAuditLogEntitySchema,
  AuthLoginEventEntitySchema,
  AuthLinkTokenEntitySchema,
  AuthMethodEntitySchema,
  AuthPermissionEntitySchema,
  AuthProviderTokenEntitySchema,
  AuthRoleEntitySchema,
  AuthRolePermissionEntitySchema,
  AuthTenantEntitySchema,
  AuthTenantInvitationEntitySchema,
  AuthTenantMembershipEntitySchema,
  AuthUserEntitySchema,
  AuthUserPermissionEntitySchema,
  AuthUserRoleEntitySchema,
  AuthUserTokenEntitySchema,
  ExternalIdentityEntitySchema,
  ProblemPresentationEntitySchema,
  TransactionalOutboxEventEntitySchema,
} from './infrastructure/data-access/entities';
import {
  AdminAuditLogRepository,
  AuthLoginEventRepository,
  AdminUserMutationRepository,
  AuthLinkTokenRepository,
  AuthMethodRepository,
  AuthProviderTokenRepository,
  AuthRoleRepository,
  AuthTokenRepository,
  AuthUserRepository,
  AuthUserRoleRepository,
  ExternalIdentityRepository,
  ProblemPresentationRepository,
} from './infrastructure/data-access/repositories';

@Injectable()
class PostgresBetterAuthDatabaseProvider implements BetterAuthDatabaseProvider, OnApplicationShutdown {
  private readonly pool: Pool | undefined;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl && process.env.OPENAPI_ENABLED !== 'true') {
      throw new Error('DATABASE_URL is required for Better-Auth PostgreSQL persistence.');
    }
    this.pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;
  }

  get database(): Pool | undefined {
    return this.pool;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end();
  }
}

@Module({
  imports: [
    MikroOrmModule.forFeature([
      AuthUserEntitySchema,
      AuthTenantEntitySchema,
      AuthTenantMembershipEntitySchema,
      AuthTenantInvitationEntitySchema,
      AuthUserTokenEntitySchema,
      ExternalIdentityEntitySchema,
      AuthMethodEntitySchema,
      AuthLinkTokenEntitySchema,
      AuthProviderTokenEntitySchema,
      AdminAuditLogEntitySchema,
      AuthLoginEventEntitySchema,
      TransactionalOutboxEventEntitySchema,
      AuthRoleEntitySchema,
      AuthPermissionEntitySchema,
      AuthRolePermissionEntitySchema,
      AuthUserRoleEntitySchema,
      AuthUserPermissionEntitySchema,
      ProblemPresentationEntitySchema,
    ]),
  ],
  providers: [
    AuthUserRepository,
    AuthTokenRepository,
    AuthTokenCleanupService,
    ExternalIdentityRepository,
    AuthMethodRepository,
    AuthLinkTokenRepository,
    AuthProviderTokenRepository,
    AdminAuditLogRepository,
    AuthLoginEventRepository,
    AdminUserMutationRepository,
    AuthRoleRepository,
    AuthUserRoleRepository,
    ProblemPresentationRepository,
    PostgresBetterAuthDatabaseProvider,
    { provide: BetterAuthDatabaseProviderInjectToken, useExisting: PostgresBetterAuthDatabaseProvider },
    { provide: AuthUserRepositoryInjectToken, useExisting: AuthUserRepository },
    { provide: AuthTokenRepositoryInjectToken, useExisting: AuthTokenRepository },
    { provide: ExternalIdentityRepositoryInjectToken, useExisting: ExternalIdentityRepository },
    { provide: AuthMethodRepositoryInjectToken, useExisting: AuthMethodRepository },
    { provide: AuthLinkTokenRepositoryInjectToken, useExisting: AuthLinkTokenRepository },
    { provide: AuthProviderTokenRepositoryInjectToken, useExisting: AuthProviderTokenRepository },
    { provide: AdminAuditLogRepositoryInjectToken, useExisting: AdminAuditLogRepository },
    { provide: AuthLoginEventRepositoryInjectToken, useExisting: AuthLoginEventRepository },
    { provide: AdminUserMutationRepositoryInjectToken, useExisting: AdminUserMutationRepository },
    { provide: AuthRoleRepositoryInjectToken, useExisting: AuthRoleRepository },
    { provide: AuthUserRoleRepositoryInjectToken, useExisting: AuthUserRoleRepository },
    { provide: ProblemPresentationRepositoryInjectToken, useExisting: ProblemPresentationRepository },
  ],
  exports: [
    MikroOrmModule,
    AuthUserRepository,
    AuthTokenRepository,
    AuthTokenCleanupService,
    ExternalIdentityRepository,
    AuthMethodRepository,
    AuthLinkTokenRepository,
    AuthProviderTokenRepository,
    AdminAuditLogRepository,
    AuthLoginEventRepository,
    AdminUserMutationRepository,
    AuthRoleRepository,
    AuthUserRoleRepository,
    ProblemPresentationRepository,
    AuthUserRepositoryInjectToken,
    AuthTokenRepositoryInjectToken,
    ExternalIdentityRepositoryInjectToken,
    AuthMethodRepositoryInjectToken,
    AuthLinkTokenRepositoryInjectToken,
    AuthProviderTokenRepositoryInjectToken,
    AdminAuditLogRepositoryInjectToken,
    AuthLoginEventRepositoryInjectToken,
    AdminUserMutationRepositoryInjectToken,
    AuthRoleRepositoryInjectToken,
    AuthUserRoleRepositoryInjectToken,
    ProblemPresentationRepositoryInjectToken,
    BetterAuthDatabaseProviderInjectToken,
  ],
})
export class AuthPostgresModule {}
