// @requirements REQ-PAYMENT-ORDER-002
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { PaymentsReadPermission } from '@app/backend-feature-payments-shared';

describe('@app/backend-feature-payments-shared alias', () => {
  it('resolves through tsconfig.base.json paths', () => {
    expect(PaymentsReadPermission).toBe('payments:read');
  });
});
