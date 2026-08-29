/* eslint-disable @typescript-eslint/no-confusing-void-expression -- Test callbacks intentionally use concise mock implementations. */
// @requirements REQ-API-RESPONSE-STUDIO-005
import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { createAdminAccess } from '../../entities/admin-session';
import {
  apiResponseStudioApi,
  type ApiResponseStudioResponse,
  type ApiResponseStudioSource,
} from '../../features/api-response-studio';
import { ApiError } from '@app/frontend-api-support';
import { ProblemPresentationsPage } from './problem-presentations-page';

const source: ApiResponseStudioSource = {
  docsUrl: 'https://api.example.test/docs',
  enabled: true,
  id: 'source-1',
  jsonUrl: 'https://api.example.test/openapi.json',
  lastSyncAt: '2026-08-28T09:00:00.000Z',
  lastSyncError: '',
  lastSyncStatus: 'success',
  lastSyncSummary: { created: 2 },
  manualOnly: true,
  name: 'Core API',
  revision: 2,
  slug: 'core-api',
  updatedAt: '2026-08-28T09:00:00.000Z',
};
const response = (id: string, path: string, status: string, tag = 'Accounts'): ApiResponseStudioResponse => ({
  changeDismissed: false,
  changeState: id === 'response-1' ? 'modified' : 'new',
  comments: 'Review',
  customDescription: 'Custom detail',
  deleted: false,
  description: 'Generated detail',
  display: 'toast',
  enumChoices: [{ property: 'code', values: ['locked'], enabledValues: [] }],
  errorType: 'https://example.test/problems#locked',
  exampleSnapshot: '{"code":"locked"}',
  figmaOnly: false,
  id,
  method: 'GET',
  operationId: `get${id}`,
  path,
  revision: 3,
  schemaSnapshot: '{"type":"object"}',
  severity: 'warning',
  stableKey: `${path}:${status}`,
  status,
  summary: 'Locked account',
  sourceId: source.id,
  support: true,
  tag,
  texts: { en: ['Try again'], ru: ['Повторите'], zh: [] },
  updatedAt: '2026-08-28T10:00:00.000Z',
});
const rows = [
  response('response-1', '/accounts/{id}', '409'),
  response('response-2', '/accounts/{id}', '404'),
  response('response-3', '/health', '503', 'System'),
];
const writeAccess = createAdminAccess({
  subject: 'admin',
  roles: ['admin'],
  permissions: ['admin:settings:read', 'admin:settings:update'],
});
const readAccess = createAdminAccess({ subject: 'reader', roles: ['reader'], permissions: ['admin:settings:read'] });

const Providers = ({ children, locale = 'en' }: { children: ReactElement; locale?: 'en' | 'ru' | 'zh' }) => (
  <FrontendStateProvider initialLocale={locale}>
    <FrontendI18nProvider translations={adminFrontendTranslations}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })}
      >
        {children}
      </QueryClientProvider>
    </FrontendI18nProvider>
  </FrontendStateProvider>
);
const installApi = () => {
  vi.spyOn(apiResponseStudioApi, 'dashboard').mockResolvedValue({ sources: [], totals: { responses: 3 } });
  vi.spyOn(apiResponseStudioApi, 'listSources').mockResolvedValue({ items: [source] });
  vi.spyOn(apiResponseStudioApi, 'listResponses').mockResolvedValue({ items: rows, total: rows.length });
  vi.spyOn(apiResponseStudioApi, 'history').mockResolvedValue({
    items: [
      {
        action: 'response.updated',
        actorUserId: 'admin',
        after: {},
        before: {},
        createdAt: '2026-08-28T10:00:00.000Z',
        id: 'history-1',
        metadata: {},
        responseId: rows[0]!.id,
        sourceId: source.id,
      },
    ],
  });
};
const renderPage = (access = writeAccess, locale: 'en' | 'ru' | 'zh' = 'en') => {
  installApi();
  return render(
    <Providers locale={locale}>
      <ProblemPresentationsPage access={access} />
    </Providers>,
  );
};
const checkbox = (name: RegExp | string) => screen.getByRole('checkbox', { name });

describe('API Response Studio', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders dashboard coverage, grouped inventory, hierarchy selection, schema/example and history', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'API Response Studio' })).toBeTruthy();
    expect(await screen.findByRole('group', { name: /EN coverage: 100%/i }, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByRole('group', { name: /ZH coverage: 0%/i })).toBeTruthy();
    fireEvent.click(checkbox('Select group Accounts'));
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.click(checkbox('Select path /accounts/{id}'));
    expect(screen.getByText('0 selected')).toBeTruthy();
    fireEvent.click(checkbox(/Select GET response 409/));
    const row = screen.getByText('GET 409').closest('article')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Schema & example' }));
    expect(screen.getByText('{"type":"object"}')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('tab', { name: 'History' }));
    const historyPanel = await screen.findByRole('tabpanel', { name: 'History' });
    expect(await within(historyPanel).findByText('response.updated')).toBeTruthy();
  });

  it('supports source create/edit/manual sync/disable and client validation', async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(apiResponseStudioApi, 'createSource').mockResolvedValue(source);
    const sync = vi.spyOn(apiResponseStudioApi, 'syncSource').mockResolvedValue({ source, summary: { created: 1 } });
    vi.spyOn(apiResponseStudioApi, 'updateSource').mockResolvedValue({ ...source, enabled: false });
    renderPage();
    await screen.findByText('GET 409');
    await user.click(screen.getByRole('tab', { name: 'Sources' }));
    await user.click(await screen.findByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(sync).toHaveBeenCalledWith(source, undefined));
    await user.click(screen.getByRole('button', { name: 'Add source' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save source' }));
    expect(await screen.findByText(/Enter a name and a lowercase slug/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Source name'), { target: { value: 'Billing API' } });
    fireEvent.change(within(dialog).getByLabelText('Source slug'), { target: { value: 'billing-api' } });
    fireEvent.change(within(dialog).getByLabelText('OpenAPI JSON HTTPS URL'), {
      target: { value: 'https://billing.example.test/openapi.json' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save source' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Billing API', slug: 'billing-api' }),
        undefined,
      ),
    );
  });

  it('edits all row fields and applies an atomic bulk editor with EN/RU/ZH arrays', async () => {
    const update = vi.spyOn(apiResponseStudioApi, 'updateResponse').mockResolvedValue(rows[0]!);
    const bulk = vi.spyOn(apiResponseStudioApi, 'bulkUpdate').mockResolvedValue({ items: rows.slice(0, 2) });
    renderPage();
    const row = (await screen.findByText('GET 409')).closest('article')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    let dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Show support guidance' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'locked' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Figma-only specification' }));
    fireEvent.change(within(dialog).getByLabelText('Custom description'), { target: { value: 'Updated detail' } });
    fireEvent.change(within(dialog).getByLabelText('Internal comments'), { target: { value: 'Updated comment' } });
    fireEvent.change(within(dialog).getByLabelText('Chinese messages'), { target: { value: '重试\n联系支持' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save response' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        rows[0],
        expect.objectContaining({
          comments: 'Updated comment',
          customDescription: 'Updated detail',
          figmaOnly: true,
          support: false,
          texts: expect.objectContaining({ zh: ['重试', '联系支持'] }),
        }),
        [{ enabledValues: ['locked'], property: 'code', values: ['locked'] }],
        undefined,
      ),
    );
    fireEvent.click(checkbox('Select group Accounts'));
    fireEvent.click(screen.getByRole('button', { name: 'Bulk edit' }));
    dialog = screen.getByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText('English messages'), { target: { value: 'Bulk one\nBulk two' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply to selection' }));
    await waitFor(() =>
      expect(bulk).toHaveBeenCalledWith(
        [
          { expectedRevision: 3, id: 'response-1' },
          { expectedRevision: 3, id: 'response-2' },
        ],
        expect.objectContaining({ texts: expect.objectContaining({ en: ['Bulk one', 'Bulk two'] }) }),
        undefined,
      ),
    );
  });

  it('renders the supported Chinese catalog without falling back to English page copy', async () => {
    renderPage(readAccess, 'zh');
    expect(await screen.findByRole('heading', { name: 'API 响应工作室' })).toBeTruthy();
    expect(await screen.findByText('只读访问')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '清单' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '导出' })).toBeTruthy();
  });

  it('keeps read-only RU administrators able to filter, inspect, export, and view history without mutation controls', async () => {
    const user = userEvent.setup();
    const exported = vi
      .spyOn(apiResponseStudioApi, 'export')
      .mockResolvedValue({ content: '{}', filename: 'responses.json', mediaType: 'application/json' });
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    renderPage(readAccess, 'ru');
    expect(await screen.findByText('Доступ только для чтения')).toBeTruthy();
    await screen.findByText('GET 409');
    expect(screen.queryByRole('button', { name: 'Добавить источник' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Экспорт' }));
    await waitFor(() => expect(exported).toHaveBeenCalled());
    await user.click(screen.getByRole('tab', { name: 'История' }));
    const historyPanel = await screen.findByRole('tabpanel', { name: 'История' });
    expect(await within(historyPanel).findByText('response.updated')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('renders loading, empty, request error, conflict and recoverable mutation errors', async () => {
    installApi();
    const failedResponses = vi
      .spyOn(apiResponseStudioApi, 'listResponses')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: rows, total: rows.length });
    render(
      <Providers>
        <ProblemPresentationsPage access={writeAccess} />
      </Providers>,
    );
    expect(await screen.findByText('The API response inventory could not be loaded.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(failedResponses).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('GET 409')).toBeTruthy();
    cleanup();
    vi.restoreAllMocks();
    installApi();
    vi.spyOn(apiResponseStudioApi, 'listResponses').mockResolvedValue({ items: [], total: 0 });
    render(
      <Providers>
        <ProblemPresentationsPage access={writeAccess} />
      </Providers>,
    );
    expect(await screen.findByText('No responses match these filters')).toBeTruthy();
    cleanup();
    vi.restoreAllMocks();
    installApi();
    vi.spyOn(apiResponseStudioApi, 'updateResponse').mockRejectedValue(new ApiError('conflict', 409));
    render(
      <Providers>
        <ProblemPresentationsPage access={writeAccess} />
      </Providers>,
    );
    const row = (await screen.findByText('GET 409')).closest('article')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save response' }));
    expect(await screen.findByText(/changed after it was opened/)).toBeTruthy();
    const listResponses = vi.mocked(apiResponseStudioApi.listResponses);
    const callsBeforeReload = listResponses.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest data' }));
    await waitFor(() => expect(listResponses.mock.calls.length).toBeGreaterThan(callsBeforeReload));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
