import { DynamicModule, Inject, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import type { Db, MongoClient } from 'mongodb';
import {
  AdminAuditLogRepositoryInjectToken,
  AdminUserMutationRepositoryInjectToken,
  AuthLinkTokenRepositoryInjectToken,
  AuthLoginEventRepositoryInjectToken,
  AuthMethodRepositoryInjectToken,
  AuthProviderTokenRepositoryInjectToken,
  AuthRoleRepositoryInjectToken,
  AuthTokenRepositoryInjectToken,
  AuthUserRepositoryInjectToken,
  AuthUserRoleRepositoryInjectToken,
  ExternalIdentityRepositoryInjectToken,
  ProblemPresentationRepositoryInjectToken,
  BetterAuthDatabaseProviderInjectToken,
} from '@app/backend-feature-auth-shared';
import {
  MongoDatabaseToken,
  MongoClientToken,
  MongoMainModule,
  type MongoModuleOptions,
  verifyAppliedMongoMigrations,
} from './mongo-runtime';
import { authMongoMigrations } from './migrations';
import { MongoAuthUserRepository } from './auth-mongo-user.repository';
import { MongoAuthTokenRepository } from './auth-mongo-token.repository';
import { MongoAuthRoleRepository, MongoAuthUserRoleRepository } from './auth-mongo-rbac.repository';
import {
  MongoAuthLinkTokenRepository,
  MongoAuthMethodRepository,
  MongoAuthProviderTokenRepository,
  MongoExternalIdentityRepository,
} from './auth-mongo-social.repository';
import { MongoAdminAuditLogRepository, MongoAdminUserMutationRepository } from './auth-mongo-admin.repository';
import { MongoAuthLoginEventRepository } from './auth-mongo-analytics.repository';
import { MongoProblemPresentationRepository } from './auth-mongo-problem-presentation.repository';

const repositories = [
  MongoAuthUserRepository,
  MongoAuthTokenRepository,
  MongoExternalIdentityRepository,
  MongoAuthMethodRepository,
  MongoAuthLinkTokenRepository,
  MongoAuthProviderTokenRepository,
  MongoAuthRoleRepository,
  MongoAuthUserRoleRepository,
  MongoAdminAuditLogRepository,
  MongoAdminUserMutationRepository,
  MongoAuthLoginEventRepository,
  MongoProblemPresentationRepository,
];
const ports = [
  { provide: AuthUserRepositoryInjectToken, useExisting: MongoAuthUserRepository },
  { provide: AuthTokenRepositoryInjectToken, useExisting: MongoAuthTokenRepository },
  { provide: ExternalIdentityRepositoryInjectToken, useExisting: MongoExternalIdentityRepository },
  { provide: AuthMethodRepositoryInjectToken, useExisting: MongoAuthMethodRepository },
  { provide: AuthLinkTokenRepositoryInjectToken, useExisting: MongoAuthLinkTokenRepository },
  { provide: AuthProviderTokenRepositoryInjectToken, useExisting: MongoAuthProviderTokenRepository },
  { provide: AuthRoleRepositoryInjectToken, useExisting: MongoAuthRoleRepository },
  { provide: AuthUserRoleRepositoryInjectToken, useExisting: MongoAuthUserRoleRepository },
  { provide: AdminAuditLogRepositoryInjectToken, useExisting: MongoAdminAuditLogRepository },
  { provide: AdminUserMutationRepositoryInjectToken, useExisting: MongoAdminUserMutationRepository },
  { provide: AuthLoginEventRepositoryInjectToken, useExisting: MongoAuthLoginEventRepository },
  { provide: ProblemPresentationRepositoryInjectToken, useExisting: MongoProblemPresentationRepository },
];
const betterAuthDatabaseProvider = {
  provide: BetterAuthDatabaseProviderInjectToken,
  useFactory: (database: Db, client: MongoClient) => ({
    database: mongodbAdapter(database, { client }),
  }),
  inject: [MongoDatabaseToken, MongoClientToken],
};

@Injectable()
export class AuthMongoMigrationVerifier implements OnModuleInit {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}

  onModuleInit(): Promise<void> {
    return verifyAppliedMongoMigrations(this.database, authMongoMigrations);
  }
}

@Module({
  providers: [AuthMongoMigrationVerifier, betterAuthDatabaseProvider, ...repositories, ...ports],
  exports: [BetterAuthDatabaseProviderInjectToken, ...repositories, ...ports],
})
export class AuthMongoPersistenceModule {}

@Module({})
export class AuthMongoModule {
  static forRoot(mongo: MongoModuleOptions = {}): DynamicModule {
    return {
      module: AuthMongoModule,
      imports: [MongoMainModule.forRoot(mongo), AuthMongoPersistenceModule],
      exports: [AuthMongoPersistenceModule],
    };
  }
}
