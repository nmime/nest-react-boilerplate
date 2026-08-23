// @requirements REQ-PAYMENTS-SCAFFOLD-001
import { describe, expect, it } from 'vitest';
import { PaymentsAdminModule } from './payments-admin.module';

describe('PaymentsAdminModule', () => {
  it('is an empty scaffold module until the U9 admin controllers arrive', () => {
    expect(PaymentsAdminModule).toBeTypeOf('function');
    expect(PaymentsAdminModule.name).toBe('PaymentsAdminModule');
  });

  it('mounts no controllers or providers of its own at the scaffold level', () => {
    const metadata = Reflect.getMetadata('controllers', PaymentsAdminModule);
    const providers = Reflect.getMetadata('providers', PaymentsAdminModule);

    expect(metadata).toBeUndefined();
    expect(providers).toBeUndefined();
  });
});
