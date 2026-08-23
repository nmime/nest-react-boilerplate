// @requirements REQ-PAYMENTS-SCAFFOLD-001
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { PaymentsMainModule } from '@app/backend-feature-payments-main';

describe('@app/backend-feature-payments-main alias', () => {
  it('resolves through tsconfig.base.json paths', () => {
    expect(typeof PaymentsMainModule.forRoot).toBe('function');
  });
});
