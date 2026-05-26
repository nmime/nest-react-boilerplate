import { Module } from "@nestjs/common";
import { AuthOAuthService } from "./auth-oauth.service";

@Module({
  providers: [AuthOAuthService],
  exports: [AuthOAuthService],
})
export class AuthOAuthModule {}
