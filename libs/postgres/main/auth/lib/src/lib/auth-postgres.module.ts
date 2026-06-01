import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
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
  providers: [AuthUserRepository, AuthTokenRepository],
  exports: [MikroOrmModule, AuthUserRepository, AuthTokenRepository],
})
export class AuthPostgresModule {}
