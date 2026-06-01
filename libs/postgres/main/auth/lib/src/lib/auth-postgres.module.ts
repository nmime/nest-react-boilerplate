import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { AuthTokenCleanupService } from "./auth-token-cleanup.service";
import {
  AuthRefreshTokenEntitySchema,
  AuthTenantEntitySchema,
  AuthTenantInvitationEntitySchema,
  AuthTenantMembershipEntitySchema,
  AuthUserEntitySchema,
  AuthUserTokenEntitySchema,
} from "./entity";
import { AuthTokenRepository, AuthUserRepository } from "./repository";

@Module({
  imports: [
    MikroOrmModule.forFeature([
      AuthUserEntitySchema,
      AuthTenantEntitySchema,
      AuthTenantMembershipEntitySchema,
      AuthTenantInvitationEntitySchema,
      AuthRefreshTokenEntitySchema,
      AuthUserTokenEntitySchema,
    ]),
  ],
  providers: [AuthUserRepository, AuthTokenRepository, AuthTokenCleanupService],
  exports: [
    MikroOrmModule,
    AuthUserRepository,
    AuthTokenRepository,
    AuthTokenCleanupService,
  ],
})
export class AuthPostgresModule {}
