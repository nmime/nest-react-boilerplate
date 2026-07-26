// @requirements REQ-RUNTIME-BOUNDARY-010
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { StaticDataModule, StaticDataRootInjectToken } from './static-data.module';
import { StaticDataService } from './static-data.service';

describe('StaticDataModule', () => {
  it('provides the root token and a service bound to it', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StaticDataModule.forRoot({ rootDir: '/srv/static' })],
    }).compile();

    expect(moduleRef.get(StaticDataRootInjectToken)).toBe('/srv/static');
    expect(moduleRef.get(StaticDataService)).toBeInstanceOf(StaticDataService);
  });
});
