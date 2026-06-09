import { DynamicModule, Module, type Provider } from "@nestjs/common";
import {
  EnvironmentFeatureFlagProvider,
  FeatureFlagProviderToken,
  type FeatureFlagProvider,
} from "@app/common/feature-flags";

export interface FeatureFlagModuleOptions {
  provider?: FeatureFlagProvider;
}

@Module({})
export class FeatureFlagModule {
  static forRoot(options: FeatureFlagModuleOptions = {}): DynamicModule {
    const featureFlagProvider: Provider<FeatureFlagProvider> = {
      provide: FeatureFlagProviderToken,
      useValue: options.provider ?? new EnvironmentFeatureFlagProvider(),
    };

    return {
      module: FeatureFlagModule,
      providers: [featureFlagProvider],
      exports: [featureFlagProvider],
    };
  }
}
