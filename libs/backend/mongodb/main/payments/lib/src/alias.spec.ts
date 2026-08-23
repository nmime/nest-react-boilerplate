// @requirements REQ-PAYMENTS-SCAFFOLD-001
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { PaymentsCollectionName } from '@app/backend-mongodb-main-payments';

describe('@app/backend-mongodb-main-payments alias', () => {
  it('resolves through tsconfig.base.json paths', () => {
    expect(PaymentsCollectionName).toBe('payments');
  });
});
