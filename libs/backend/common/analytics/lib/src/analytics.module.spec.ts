import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsModule } from './analytics.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsConfigService } from './config';

describe('AnalyticsModule', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('wires the config service value into the dynamic module for forRoot', () => {
    const dynamicModule = AnalyticsModule.forRoot({ appName: 'shape-app' });

    expect(dynamicModule.module).toBe(AnalyticsModule);
    expect(dynamicModule.exports).toEqual([AnalyticsConfigService, AnalyticsService]);
    const [provider] = dynamicModule.providers ?? [];
    expect(provider).toMatchObject({ provide: AnalyticsConfigService });
    expect((provider as { useValue: AnalyticsConfigService }).useValue).toBeInstanceOf(AnalyticsConfigService);
  });

  it('wires the supplied configuration through to the analytics service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AnalyticsModule.forRoot({ environment: 'acceptance', enabled: false })],
    }).compile();

    const service = moduleRef.get(AnalyticsService);

    expect(service).toBeInstanceOf(AnalyticsService);
    expect(service.environment).toBe('acceptance');
  });

  it('falls back to an empty configuration when forRoot is called without options', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AnalyticsModule.forRoot()],
    }).compile();

    expect(moduleRef.get(AnalyticsConfigService)).toBeInstanceOf(AnalyticsConfigService);
    expect(moduleRef.get(AnalyticsService)).toBeInstanceOf(AnalyticsService);
  });
});
