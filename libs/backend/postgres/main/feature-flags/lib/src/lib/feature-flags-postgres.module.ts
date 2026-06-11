import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { FeatureFlagProviderToken } from "@app/common/feature-flags";
import { FeatureFlagEntitySchema } from "./entity";
import { PostgresFeatureFlagProvider } from "./feature-flag-postgres.service";
import { FeatureFlagRepository } from "./repository";

@Module({
  imports: [MikroOrmModule.forFeature([FeatureFlagEntitySchema])],
  providers: [
    FeatureFlagRepository,
    PostgresFeatureFlagProvider,
    {
      provide: FeatureFlagProviderToken,
      useExisting: PostgresFeatureFlagProvider,
    },
  ],
  exports: [
    MikroOrmModule,
    FeatureFlagRepository,
    PostgresFeatureFlagProvider,
    FeatureFlagProviderToken,
  ],
})
export class FeatureFlagsPostgresModule {}
