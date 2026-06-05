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
} from "./entity";
import {
  AdminAuditLogRepository,
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
    ]),
  ],
  providers: [
    AuthUserRepository,
    AuthTokenRepository,
    AuthTokenCleanupService,
    AdminAuditLogRepository,
  ],
  exports: [
    MikroOrmModule,
    AuthUserRepository,
    AuthTokenRepository,
    AuthTokenCleanupService,
    AdminAuditLogRepository,
  ],
})
export class AuthPostgresModule {}
