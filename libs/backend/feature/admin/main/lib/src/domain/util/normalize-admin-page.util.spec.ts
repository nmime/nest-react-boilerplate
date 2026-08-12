// @requirements REQ-AUTH-TENANT-004
import { describe, expect, it } from 'vitest';
import { AdminMaxPageSize } from '../const';
import { normalizeAdminPage } from './normalize-admin-page.util';

describe('normalizeAdminPage', () => {
  it('keeps the admin default page size', () => {
    expect(normalizeAdminPage({})).toEqual({ limit: 50, offset: 0 });
  });

  it('caps the page size at the admin maximum', () => {
    expect(normalizeAdminPage({ limit: 500 })).toEqual({ limit: AdminMaxPageSize, offset: 0 });
  });

  it('refuses a non-positive page size and a negative offset', () => {
    expect(normalizeAdminPage({ limit: 0, offset: -1 })).toEqual({ limit: 1, offset: 0 });
  });
});
