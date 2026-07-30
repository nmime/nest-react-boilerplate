// @requirements REQ-AUTH-TENANT-004
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { BaseHealthController, HealthService } from '@app/backend-common-health';
import { AdminProfileController } from '@app/backend-feature-admin-main';
import { AdminAppApiModule } from './admin-app-api.module';
import { AdminHealthController } from './admin-health.controller';

// The app imports the shared health controller from @app/backend-common-health instead
// of declaring an app-local duplicate controller.
describe('AdminAppApiModule', () => {
  it('wires app-owned health and feature composition without requiring an uninitialized provider', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AdminAppApiModule) as unknown[];
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AdminAppApiModule) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AdminAppApiModule) as unknown[];

    expect(controllers).toEqual(expect.arrayContaining([BaseHealthController, AdminHealthController]));
    expect(imports).toEqual(expect.arrayContaining([expect.any(Function)]));
    expect(providers).toEqual(expect.arrayContaining([expect.objectContaining({ provide: HealthService })]));
    expect(AdminProfileController).toBeDefined();
  });
});
