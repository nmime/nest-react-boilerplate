// @requirements REQ-PAYMENT-ORDER-004 REQ-PAYMENT-WEBHOOK-002
import { describe, expect, it } from 'vitest';
import { PaymentsEntity, PaymentsEntitySchema } from './payments.entity';

describe('PaymentsEntity', () => {
  it('assigns an identifier and creation timestamp on construction', () => {
    const entity = new PaymentsEntity({ name: 'Example' });

    expect(entity.name).toBe('Example');
    expect(entity.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(entity.createdAt).toBeInstanceOf(Date);
  });

  it('leaves the name unset when constructed without input', () => {
    expect(new PaymentsEntity().name).toBeUndefined();
  });

  it('maps to the payments table and stamps createdAt on insert', () => {
    expect(PaymentsEntitySchema.meta.tableName).toBe('payments');
    expect(PaymentsEntitySchema.meta.properties.createdAt.onCreate?.({} as never, {} as never)).toBeInstanceOf(Date);
  });
});
