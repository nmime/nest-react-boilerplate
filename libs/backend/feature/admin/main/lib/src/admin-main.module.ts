import { Module } from '@nestjs/common';
import {
  AdminAuditLogRepositoryInjectToken,
  ApiResponseStudioRepositoryInjectToken,
  AdminUserMutationRepositoryInjectToken,
  AuthRoleRepositoryInjectToken,
  AuthUserRepositoryInjectToken,
  ProblemPresentationRepositoryInjectToken,
  type AdminAuditLogRepositoryPort,
  type ApiResponseStudioRepositoryPort,
  type AdminUserMutationRepositoryPort,
  type AuthRoleRepositoryPort,
  type AuthUserRepositoryPort,
  type ProblemPresentationRepositoryPort,
} from '@app/backend-feature-auth-shared';
import { FeatureFlagRepositoryToken } from '@app/common-feature-flags';
import {
  type AdminFeatureFlagRepository,
  AdminFeatureFlagsUseCase,
  ApiResponseStudioService,
  SafeOpenApiFetcher,
  GetAdminProfileUseCase,
  AdminRolesUseCase,
  AdminUsersUseCase,
  ProblemPresentationsUseCase,
} from './application';
import {
  AdminApiResponseStudioController,
  AdminDatabaseAccessGuard,
  AdminFeatureFlagsController,
  AdminProblemPresentationsController,
  AdminProfileController,
  AdminRolesController,
  AdminUsersController,
} from './interfaces/http';

@Module({
  controllers: [
    AdminApiResponseStudioController,
    AdminFeatureFlagsController,
    AdminProfileController,
    AdminRolesController,
    AdminUsersController,
    AdminProblemPresentationsController,
  ],
  providers: [
    AdminApiResponseStudioController,
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
        ApiResponseStudioRepositoryInjectToken,
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
        ApiResponseStudioRepositoryInjectToken,
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
