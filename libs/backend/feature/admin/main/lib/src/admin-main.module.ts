import { Module } from '@nestjs/common';
import { PostgresMainModule } from '@app/backend-postgres-main';
import {
  AdminAuditLogRepository,
  AdminUserMutationRepository,
  AuthPostgresModule,
  AuthRoleRepository,
  AuthUserRepository,
  ProblemPresentationRepository,
} from '@app/backend-postgres-main-auth';
import {
  GetAdminProfileUseCase,
  AdminRolesUseCase,
  AdminUsersUseCase,
  ProblemPresentationsUseCase,
} from './application';
import {
  AdminProblemPresentationsController,
  AdminProfileController,
  AdminRolesController,
  AdminUsersController,
} from './interfaces/http';

@Module({
  imports: [PostgresMainModule.forRoot(), AuthPostgresModule],
  controllers: [
    AdminProfileController,
    AdminRolesController,
    AdminUsersController,
    AdminProblemPresentationsController,
  ],
  providers: [
    GetAdminProfileUseCase,
    {
      provide: AdminUsersUseCase,
      inject: [AuthUserRepository, AdminAuditLogRepository, AdminUserMutationRepository],
      useFactory: (
        users: AuthUserRepository,
        auditLogs: AdminAuditLogRepository,
        adminUserMutations: AdminUserMutationRepository,
      ) => new AdminUsersUseCase(users, auditLogs, adminUserMutations),
    },
    {
      provide: AdminRolesUseCase,
      inject: [AuthRoleRepository, AdminUserMutationRepository],
      useFactory: (roles: AuthRoleRepository, adminUserMutations: AdminUserMutationRepository) =>
        new AdminRolesUseCase(roles, adminUserMutations),
    },
    {
      provide: ProblemPresentationsUseCase,
      inject: [ProblemPresentationRepository],
      useFactory: (presentations: ProblemPresentationRepository) => new ProblemPresentationsUseCase(presentations),
    },
  ],
})
export class AdminMainModule {}
