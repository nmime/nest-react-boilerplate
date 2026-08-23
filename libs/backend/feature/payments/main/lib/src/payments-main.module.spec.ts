// @requirements REQ-PAYMENTS-SCAFFOLD-001
import { Module } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PaymentsController } from './payments.controller';
import { PaymentsMainModule } from './payments-main.module';
import { PaymentsService } from './payments.service';

@Module({})
class StubPersistenceModule {}

describe('PaymentsMainModule', () => {
  it('takes its persistence from the caller so the feature never names an axis', () => {
    const dynamicModule = PaymentsMainModule.forRoot({ imports: [StubPersistenceModule] });

    expect(dynamicModule.module).toBe(PaymentsMainModule);
    expect(dynamicModule.imports).toEqual([StubPersistenceModule]);
    expect(dynamicModule.providers).toEqual(expect.arrayContaining([PaymentsService]));
    expect(dynamicModule.exports).toEqual(expect.arrayContaining([PaymentsService]));
  });

  it('keeps the HTTP surface out of a process that only needs the service', () => {
    expect(PaymentsMainModule.forRoot().controllers ?? []).toEqual([]);
    expect(PaymentsMainModule.forRoot({ exposeHttp: true }).controllers).toEqual([PaymentsController]);
  });

  it('accepts the scheduler contract the capability wiring passes', () => {
    const dynamicModule = PaymentsMainModule.forRoot({
      imports: [StubPersistenceModule],
      exposeHttp: true,
      scheduler: { enabled: true, intervalMs: 60_000 },
    });

    expect(dynamicModule.imports).toEqual([StubPersistenceModule]);
    expect(dynamicModule.controllers).toEqual([PaymentsController]);
    expect(dynamicModule.providers).toEqual(expect.arrayContaining([PaymentsService]));
  });
});
