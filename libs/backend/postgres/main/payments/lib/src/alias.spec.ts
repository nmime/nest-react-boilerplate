// @requirements REQ-PAYMENT-PROVIDER-002 REQ-PAYMENT-PROVIDER-004
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { PaymentsPostgresModule } from '@app/backend-postgres-main-payments';

describe('@app/backend-postgres-main-payments alias', () => {
  it('resolves through tsconfig.base.json paths', () => {
    expect(PaymentsPostgresModule).toBeDefined();
  });
});
