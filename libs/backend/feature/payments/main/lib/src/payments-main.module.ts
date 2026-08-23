import { type DynamicModule, type ModuleMetadata, Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

export interface PaymentsMainModuleOptions {
  /**
   * The persistence module that binds `PaymentsPersistence` — the Postgres or MongoDB one.
   *
   * Passed in rather than imported here so this module compiles without either axis present, which
   * is what lets the setup tool remove one of them without touching feature code.
   */
  imports?: NonNullable<ModuleMetadata['imports']>;
  /** Expose the customer + webhook endpoints in this process. */
  exposeHttp?: boolean;
  /**
   * The reconciliation/outbox scheduler this process should run.
   *
   * Accepted at the scaffold level; the scheduler services land with reconciliation (U10).
   */
  scheduler?: { enabled: boolean; intervalMs: number };
}

@Module({})
export class PaymentsMainModule {
  static forRoot(options: PaymentsMainModuleOptions = {}): DynamicModule {
    return {
      module: PaymentsMainModule,
      imports: options.imports ?? [],
      controllers: options.exposeHttp === true ? [PaymentsController] : [],
      providers: [PaymentsService],
      exports: [PaymentsService],
    };
  }
}
