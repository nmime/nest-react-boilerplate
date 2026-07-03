import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { AuthTokenCleanupService } from "./auth-token-cleanup.service";
import {
  AdminAuditLogEntitySchema,
  AuthLinkTokenEntitySchema,
  AuthMethodEntitySchema,
  AuthProviderTokenEntitySchema,
  AuthRefreshTokenEntitySchema,
  AuthTenantEntitySchema,
  AuthTenantInvitationEntitySchema,
  AuthTenantMembershipEntitySchema,
  AuthUserEntitySchema,
  AuthUserTokenEntitySchema,
  ExternalIdentityEntitySchema,
  TransactionalOutboxEventEntitySchema,
} from "./infrastructure/data-access/entities";
import {
  AdminAuditLogRepository,
  AdminUserMutationRepository,
  AuthLinkTokenRepository,
  AuthMethodRepository,
  AuthProviderTokenRepository,
  AuthTokenRepository,
  AuthUserRepository,
  ExternalIdentityRepository,
} from "./infrastructure/data-access/repositories";

@Module({
  imports: [
    MikroOrmModule.forFeature([
      AuthUserEntitySchema,
      AuthTenantEntitySchema,
      AuthTenantMembershipEntitySchema,
      AuthTenantInvitationEntitySchema,
      AuthRefreshTokenEntitySchema,
      AuthUserTokenEntitySchema,
      ExternalIdentityEntitySchema,
      AuthMethodEntitySchema,
      AuthLinkTokenEntitySchema,
      AuthProviderTokenEntitySchema,
      AdminAuditLogEntitySchema,
      TransactionalOutboxEventEntitySchema,
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
    AdminUserMutationRepository,
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
    AdminUserMutationRepository,
  ],
})
export class AuthPostgresModule {}
