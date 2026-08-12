import { normalizeOffsetPage } from '@app/backend-common-response';
import { AdminDefaultPageSize, AdminMaxPageSize } from '../const';
import type { AdminPage, AdminPageQuery } from '../type';

/**
 * Admin list paging is the shared offset convention with the admin ceiling; the
 * clamping rules (non-positive limits, negative offsets) live once in
 * `@app/backend-common-response` rather than per feature.
 */
export const normalizeAdminPage = (query: AdminPageQuery): AdminPage =>
  normalizeOffsetPage(query, { defaultPageSize: AdminDefaultPageSize, maxPageSize: AdminMaxPageSize });
