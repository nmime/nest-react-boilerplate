// @requirements REQ-PAYMENT-PROVIDER-001
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { PaymentsAdminModule } from '@app/backend-feature-payments-admin';

describe('@app/backend-feature-payments-admin alias', () => {
  it('resolves through tsconfig.base.json paths', () => {
    expect(PaymentsAdminModule).toBeDefined();
  });
});
