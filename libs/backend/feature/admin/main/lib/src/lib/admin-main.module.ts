import { Module } from "@nestjs/common";
import { PostgresMainModule } from "@app/backend/postgres/main";
import {
  AdminAuditLogRepository,
  AdminUserMutationRepository,
  AuthPostgresModule,
  AuthUserRepository,
} from "@app/backend/postgres/main/auth";
import { GetAdminProfileUseCase } from "./application/admin-profile.use-case";
import { AdminUsersUseCase } from "./application/admin-users.use-case";
import { AdminProfileController } from "./interfaces/http/admin-profile.controller";
import { AdminUsersController } from "./interfaces/http/admin-users.controller";

@Module({
  imports: [PostgresMainModule.forRoot(), AuthPostgresModule],
  controllers: [AdminProfileController, AdminUsersController],
  providers: [
    GetAdminProfileUseCase,
    {
      provide: AdminUsersUseCase,
      inject: [
        AuthUserRepository,
        AdminAuditLogRepository,
        AdminUserMutationRepository,
      ],
      useFactory: (
        users: AuthUserRepository,
        auditLogs: AdminAuditLogRepository,
        adminUserMutations: AdminUserMutationRepository,
      ) => new AdminUsersUseCase(users, auditLogs, adminUserMutations),
    },
  ],
})
export class AdminMainModule {}
