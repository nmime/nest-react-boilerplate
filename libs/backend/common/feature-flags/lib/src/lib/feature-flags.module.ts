import { DynamicModule, Module, type Provider } from "@nestjs/common";
import {
  EnvironmentFeatureFlagProvider,
  FeatureFlagProviderToken,
  type FeatureFlagProvider,
} from "@app/common/feature-flags";

export interface FeatureFlagsModuleOptions {
  provider?: FeatureFlagProvider;
}

@Module({})
export class FeatureFlagsModule {
  static forRoot(options: FeatureFlagsModuleOptions = {}): DynamicModule {
    const featureFlagProvider: Provider<FeatureFlagProvider> = {
      provide: FeatureFlagProviderToken,
      useValue: options.provider ?? new EnvironmentFeatureFlagProvider(),
    };

    return {
      module: FeatureFlagsModule,
      providers: [featureFlagProvider],
      exports: [featureFlagProvider],
    };
  }
}
