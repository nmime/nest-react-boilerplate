import { describe, expect, it } from "vitest";
import {
  FeatureFlagProviderToken,
  InMemoryFeatureFlagProvider,
} from "@app/common/feature-flags";
import { FeatureFlagsModule } from "./index";

describe("backend feature flag module", () => {
  it("registers the shared feature flag provider token", () => {
    const provider = new InMemoryFeatureFlagProvider({
      "billing.portal": true,
    });
    const dynamicModule = FeatureFlagsModule.forRoot({ provider });

    expect(dynamicModule.providers).toContainEqual({
      provide: FeatureFlagProviderToken,
      useValue: provider,
    });
    expect(dynamicModule.exports).toContainEqual({
      provide: FeatureFlagProviderToken,
      useValue: provider,
    });
  });
});
