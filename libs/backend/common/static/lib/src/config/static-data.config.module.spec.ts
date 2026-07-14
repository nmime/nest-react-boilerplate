import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { StaticDataConfigModule } from './static-data.config.module';
import { StaticDataConfigService } from './static-data.config.service';

describe('StaticDataConfigModule', () => {
  it('declares and exports the config service', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, StaticDataConfigModule)).toContain(StaticDataConfigService);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, StaticDataConfigModule)).toContain(StaticDataConfigService);
  });
});
