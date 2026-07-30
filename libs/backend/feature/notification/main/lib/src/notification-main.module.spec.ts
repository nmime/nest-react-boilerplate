// @requirements REQ-NOTIFY-LIFECYCLE-002
import { afterEach, describe, expect, it } from 'vitest';
import { NotificationMainModule } from './notification-main.module';
import { NotificationProviderReadinessService } from './service';

const originalNodeEnvironment = process.env['NODE_ENV'];

afterEach(() => {
  process.env['NODE_ENV'] = originalNodeEnvironment;
});

describe('NotificationMainModule', () => {
  it('keeps the reference HTTP surface disabled by default', () => {
    process.env['NODE_ENV'] = 'development';

    const definition = NotificationMainModule.forRoot();

    expect(definition.controllers).toEqual([]);
  });

  it('exposes the reference HTTP surface only when explicitly enabled', () => {
    process.env['NODE_ENV'] = 'development';

    const definition = NotificationMainModule.forRoot({ exposeHttp: true });

    expect(definition.controllers).toHaveLength(1);
  });

  it('imports selected scheduler transport modules into its own DI scope', () => {
    process.env['NODE_ENV'] = 'development';
    class SelectedTransportModule {}

    const definition = NotificationMainModule.forRoot({
      imports: [SelectedTransportModule],
      enableScheduler: true,
    });

    expect(definition.imports).toContain(SelectedTransportModule);
    expect(definition.providers).toContain(NotificationProviderReadinessService);
    expect(definition.exports).toContain(NotificationProviderReadinessService);
  });
});
