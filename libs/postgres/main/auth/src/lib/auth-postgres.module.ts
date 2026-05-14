import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthUserEntity } from "./entity";
import { AuthUserRepository } from "./repository";

@Module({
  imports: [TypeOrmModule.forFeature([AuthUserEntity])],
  providers: [AuthUserRepository],
  exports: [TypeOrmModule, AuthUserRepository],
})
export class AuthPostgresModule {}
