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
import { FeatureFlagRepository, FeatureFlagsPostgresModule } from '@app/backend-postgres-main-feature-flags';
import {
  AdminFeatureFlagsUseCase,
  GetAdminProfileUseCase,
  AdminRolesUseCase,
  AdminUsersUseCase,
  ProblemPresentationsUseCase,
} from './application';
import {
  AdminDatabaseAccessGuard,
  AdminFeatureFlagsController,
  AdminProblemPresentationsController,
  AdminProfileController,
  AdminRolesController,
  AdminUsersController,
} from './interfaces/http';

@Module({
  imports: [PostgresMainModule.forRoot(), AuthPostgresModule, FeatureFlagsPostgresModule],
  controllers: [
    AdminFeatureFlagsController,
    AdminProfileController,
    AdminRolesController,
    AdminUsersController,
    AdminProblemPresentationsController,
  ],
  providers: [
    AdminDatabaseAccessGuard,
    {
      provide: AdminFeatureFlagsUseCase,
      inject: [FeatureFlagRepository, AdminAuditLogRepository],
      useFactory: (featureFlags: FeatureFlagRepository, auditLogs: AdminAuditLogRepository) =>
        new AdminFeatureFlagsUseCase(featureFlags, auditLogs),
    },
    GetAdminProfileUseCase,
    {
      provide: AdminUsersUseCase,
      inject: [AuthUserRepository, AdminAuditLogRepository, AdminUserMutationRepository, AuthRoleRepository],
      useFactory: (
        users: AuthUserRepository,
        auditLogs: AdminAuditLogRepository,
        adminUserMutations: AdminUserMutationRepository,
        roles: AuthRoleRepository,
      ) => new AdminUsersUseCase(users, auditLogs, adminUserMutations, roles),
    },
    {
      provide: AdminRolesUseCase,
      inject: [AuthRoleRepository, AdminUserMutationRepository, AdminAuditLogRepository],
      useFactory: (
        roles: AuthRoleRepository,
        adminUserMutations: AdminUserMutationRepository,
        auditLogs: AdminAuditLogRepository,
      ) => new AdminRolesUseCase(roles, adminUserMutations, auditLogs),
    },
    {
      provide: ProblemPresentationsUseCase,
      inject: [ProblemPresentationRepository],
      useFactory: (presentations: ProblemPresentationRepository) => new ProblemPresentationsUseCase(presentations),
    },
  ],
  exports: [AdminDatabaseAccessGuard],
})
export class AdminMainModule {}
