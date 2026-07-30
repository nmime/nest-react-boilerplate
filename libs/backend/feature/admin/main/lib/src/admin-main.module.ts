import { Module } from '@nestjs/common';
import {
  AdminAuditLogRepositoryInjectToken,
  AdminUserMutationRepositoryInjectToken,
  AuthRoleRepositoryInjectToken,
  AuthUserRepositoryInjectToken,
  ProblemPresentationRepositoryInjectToken,
  type AdminAuditLogRepositoryPort,
  type AdminUserMutationRepositoryPort,
  type AuthRoleRepositoryPort,
  type AuthUserRepositoryPort,
  type ProblemPresentationRepositoryPort,
} from '@app/backend-feature-auth-shared';
import { FeatureFlagRepositoryToken } from '@app/common-feature-flags';
import {
  type AdminFeatureFlagRepository,
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
      inject: [FeatureFlagRepositoryToken, AdminAuditLogRepositoryInjectToken],
      useFactory: (featureFlags: AdminFeatureFlagRepository, auditLogs: AdminAuditLogRepositoryPort) =>
        new AdminFeatureFlagsUseCase(featureFlags, auditLogs),
    },
    GetAdminProfileUseCase,
    {
      provide: AdminUsersUseCase,
      inject: [
        AuthUserRepositoryInjectToken,
        AdminAuditLogRepositoryInjectToken,
        AdminUserMutationRepositoryInjectToken,
        AuthRoleRepositoryInjectToken,
      ],
      useFactory: (
        users: AuthUserRepositoryPort,
        auditLogs: AdminAuditLogRepositoryPort,
        adminUserMutations: AdminUserMutationRepositoryPort,
        roles: AuthRoleRepositoryPort,
      ) => new AdminUsersUseCase(users, auditLogs, adminUserMutations, roles),
    },
    {
      provide: AdminRolesUseCase,
      inject: [
        AuthRoleRepositoryInjectToken,
        AdminUserMutationRepositoryInjectToken,
        AdminAuditLogRepositoryInjectToken,
      ],
      useFactory: (
        roles: AuthRoleRepositoryPort,
        adminUserMutations: AdminUserMutationRepositoryPort,
        auditLogs: AdminAuditLogRepositoryPort,
      ) => new AdminRolesUseCase(roles, adminUserMutations, auditLogs),
    },
    {
      provide: ProblemPresentationsUseCase,
      inject: [ProblemPresentationRepositoryInjectToken],
      useFactory: (presentations: ProblemPresentationRepositoryPort) => new ProblemPresentationsUseCase(presentations),
    },
  ],
  exports: [AdminDatabaseAccessGuard],
})
export class AdminMainModule {}
