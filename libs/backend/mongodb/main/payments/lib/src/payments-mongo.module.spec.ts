// @requirements REQ-PAYMENT-PROVIDER-005
import { describe, expect, it } from 'vitest';
import { PaymentsMongoModule } from './payments-mongo.module';
import { PaymentsRepository } from './payments-mongo.repository';

describe('PaymentsMongoModule', () => {
  it('provides and exports the scaffold repository', () => {
    expect(Reflect.getMetadata('providers', PaymentsMongoModule)).toEqual([PaymentsRepository]);
    expect(Reflect.getMetadata('exports', PaymentsMongoModule)).toEqual([PaymentsRepository]);
  });
});
