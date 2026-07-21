import { describe, expect, it } from 'vitest';
import { AuthAdminModule, AuthLoginAnalyticsAdminService } from './index';

describe('AuthAdminLibrary', () => {
  it('exports its module and application service', () => {
    expect(AuthAdminModule).toBeDefined();
    expect(AuthLoginAnalyticsAdminService).toBeDefined();
  });
});
