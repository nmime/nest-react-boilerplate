import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { FeatureFlagProviderToken, FeatureFlagRepositoryToken } from '@app/common-feature-flags';
import { FeatureFlagEntitySchema } from './infrastructure/data-access/entities';
import { PostgresFeatureFlagProvider } from './feature-flag-postgres.service';
import { FeatureFlagRepository } from './infrastructure/data-access/repositories';

@Module({
  imports: [MikroOrmModule.forFeature([FeatureFlagEntitySchema])],
  providers: [
    FeatureFlagRepository,
    PostgresFeatureFlagProvider,
    {
      provide: FeatureFlagProviderToken,
      useExisting: PostgresFeatureFlagProvider,
    },
    {
      provide: FeatureFlagRepositoryToken,
      useExisting: FeatureFlagRepository,
    },
  ],
  exports: [
    MikroOrmModule,
    FeatureFlagRepository,
    PostgresFeatureFlagProvider,
    FeatureFlagProviderToken,
    FeatureFlagRepositoryToken,
  ],
})
export class FeatureFlagsPostgresModule {}
