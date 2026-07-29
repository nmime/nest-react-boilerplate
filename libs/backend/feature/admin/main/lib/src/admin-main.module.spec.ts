import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AdminProfileController } from './interfaces/http/admin-profile.controller';
import { AdminMainModule } from './admin-main.module';

describe('AdminMainModule', () => {
  it('declares the admin profile controller without selecting persistence', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AdminMainModule) as unknown[];
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AdminMainModule) as unknown[] | undefined;

    expect(controllers).toContain(AdminProfileController);
    expect(imports ?? []).toEqual([]);
  });
});
