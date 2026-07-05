import { Module } from "@nestjs/common";
import { PostgresMainModule } from "@app/backend-postgres-main";
import {
  AdminAuditLogRepository,
  AdminUserMutationRepository,
  AuthPostgresModule,
  AuthRoleRepository,
  AuthUserRepository,
} from "@app/backend-postgres-main-auth";
import {
  GetAdminProfileUseCase,
  AdminRolesUseCase,
  AdminUsersUseCase,
} from "./application";
import {
  AdminProfileController,
  AdminRolesController,
  AdminUsersController,
} from "./interfaces/http";

@Module({
  imports: [PostgresMainModule.forRoot(), AuthPostgresModule],
  controllers: [
    AdminProfileController,
    AdminRolesController,
    AdminUsersController,
  ],
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
    {
      provide: AdminRolesUseCase,
      inject: [AuthRoleRepository, AdminUserMutationRepository],
      useFactory: (
        roles: AuthRoleRepository,
        adminUserMutations: AdminUserMutationRepository,
      ) => new AdminRolesUseCase(roles, adminUserMutations),
    },
  ],
})
export class AdminMainModule {}
