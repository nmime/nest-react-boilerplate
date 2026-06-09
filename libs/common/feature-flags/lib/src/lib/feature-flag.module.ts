import { DynamicModule, Module, type Provider } from "@nestjs/common";
import { EnvironmentFeatureFlagProvider } from "./feature-flag.provider";
import {
  FeatureFlagProviderToken,
  type FeatureFlagProvider,
} from "./feature-flag.types";

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
