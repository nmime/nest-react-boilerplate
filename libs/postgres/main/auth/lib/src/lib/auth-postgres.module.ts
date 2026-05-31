import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { AuthUserEntitySchema } from "./entity";
import { AuthUserRepository } from "./repository";

@Module({
  imports: [MikroOrmModule.forFeature([AuthUserEntitySchema])],
  providers: [AuthUserRepository],
  exports: [MikroOrmModule, AuthUserRepository],
})
export class AuthPostgresModule {}
