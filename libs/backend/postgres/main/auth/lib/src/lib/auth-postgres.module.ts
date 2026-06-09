import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { AuthTokenCleanupService } from "./auth-token-cleanup.service";
import {
  AdminAuditLogEntitySchema,
  AuthRefreshTokenEntitySchema,
  AuthTenantEntitySchema,
  AuthTenantInvitationEntitySchema,
  AuthTenantMembershipEntitySchema,
  AuthUserEntitySchema,
  AuthUserTokenEntitySchema,
  TransactionalOutboxEventEntitySchema,
} from "./entity";
import {
  AdminAuditLogRepository,
  AdminUserMutationRepository,
  AuthTokenRepository,
  AuthUserRepository,
} from "./repository";

@Module({
  imports: [
    MikroOrmModule.forFeature([
      AuthUserEntitySchema,
      AuthTenantEntitySchema,
      AuthTenantMembershipEntitySchema,
      AuthTenantInvitationEntitySchema,
      AuthRefreshTokenEntitySchema,
      AuthUserTokenEntitySchema,
      AdminAuditLogEntitySchema,
      TransactionalOutboxEventEntitySchema,
    ]),
  ],
  providers: [
    AuthUserRepository,
    AuthTokenRepository,
    AuthTokenCleanupService,
    AdminAuditLogRepository,
    AdminUserMutationRepository,
  ],
  exports: [
    MikroOrmModule,
    AuthUserRepository,
    AuthTokenRepository,
    AuthTokenCleanupService,
    AdminAuditLogRepository,
    AdminUserMutationRepository,
  ],
})
export class AuthPostgresModule {}
