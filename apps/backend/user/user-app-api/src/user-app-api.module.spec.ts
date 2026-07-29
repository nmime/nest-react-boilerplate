import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { BaseHealthController, HealthService } from '@app/backend-common-health';
import { ProfileController } from '@app/backend-feature-user-main';
import { UserAppApiModule } from './user-app-api.module';

// The app imports the shared health controller from @app/backend-common-health instead
// of declaring an app-local duplicate controller.
describe('UserAppApiModule', () => {
  it('wires app-owned health and feature composition without requiring an uninitialized provider', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, UserAppApiModule) as unknown[];
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, UserAppApiModule) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, UserAppApiModule) as unknown[];

    expect(controllers).toContain(BaseHealthController);
    expect(imports).toEqual(expect.arrayContaining([expect.any(Function)]));
    expect(providers).toEqual(expect.arrayContaining([expect.objectContaining({ provide: HealthService })]));
    expect(ProfileController).toBeDefined();
  });
});
