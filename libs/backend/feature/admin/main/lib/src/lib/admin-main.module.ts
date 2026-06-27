import { Module } from "@nestjs/common";
import { PostgresMainModule } from "@app/backend/postgres/main";
import { AuthPostgresModule } from "@app/backend/postgres/main/auth";
import { AdminProfileController } from "./admin-profile.controller";
import { AdminUsersController } from "./admin-users.controller";

@Module({
  imports: [PostgresMainModule.forRoot(), AuthPostgresModule],
  controllers: [AdminProfileController, AdminUsersController],
})
export class AdminMainModule {}
