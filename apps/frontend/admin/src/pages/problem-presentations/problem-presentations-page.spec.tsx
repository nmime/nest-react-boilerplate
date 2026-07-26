// @requirements REQ-FRONTEND-SHELL-004
import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiToastRuntime } from '@app/frontend-api-support';
import { adminApi } from '@app/frontend-api-client';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { FrontendI18nProvider, FrontendStateProvider, type Locale } from '@app/frontend-runtime';
import { createAdminAccess, type AdminAccess } from '../../entities/admin-session';
import { ProblemPresentationsPage } from './problem-presentations-page';

const { catalog } = vi.hoisted(() => ({
  catalog: [
    {
      app: 'admin-app-api',
      defaultDisplay: 'toast',
      defaultMessage: 'Generated success message',
      defaultSeverity: 'error',
      errorCode: 'success-code',
      id: 'admin-app-api:GET:/success:400:success-code',
      method: 'GET',
      operationId: 'getSuccess',
      path: '/success',
      status: 400,
      tags: ['SuccessTag'],
    },
    {
      app: 'admin-app-api',
      defaultDisplay: 'toast',
      defaultMessage: 'Generated info message',
      defaultSeverity: 'warning',
      errorCode: null,
      id: 'admin-app-api:POST:/info:409',
      method: 'POST',
      operationId: 'postInfo',
      path: '/info',
      status: 409,
      tags: [],
    },
    {
      app: 'auth-app-api',
      defaultDisplay: 'silent',
      defaultMessage: 'Generated silent message',
      defaultSeverity: 'error',
      errorCode: null,
      id: 'auth-app-api:GET:/silent:401',
      method: 'GET',
      operationId: null,
      path: '/silent',
      status: 401,
      tags: [],
    },
    {
      app: 'user-app-api',
      defaultDisplay: 'toast',
      defaultMessage: 'Generated default message',
      defaultSeverity: 'warning',
      errorCode: null,
      id: 'user-app-api:GET:/default:503',
      method: 'GET',
      operationId: 'getDefault',
      path: '/default',
      status: 503,
      tags: ['DefaultTag'],
    },
  ],
}));

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return { ...actual, apiToastRuleCatalog: catalog };
});

const writeAccess = createAdminAccess({
  subject: 'admin-id',
  roles: ['admin'],
  permissions: ['admin:settings:read', 'admin:settings:update'],
});
const readAccess = createAdminAccess({
  subject: 'admin-id',
  roles: ['admin'],
  permissions: ['admin:settings:read'],
});

type Override = adminApi.AdminProblemPresentationViewDto;

const activeOverrides: Override[] = [
  {
    comment: 'Success override',
    display: 'toast',
    messageEn: '',
    messageRu: 'Русский fallback',
    revision: 1,
    ruleId: 'admin-app-api:GET:/success:400:success-code',
    severity: 'success',
  },
  {
    comment: 'Info override',
    display: 'toast',
    messageEn: 'English info',
    messageRu: '',
    revision: 2,
    ruleId: 'admin-app-api:POST:/info:409',
    severity: 'info',
    updatedAt: '2026-07-19T12:00:00.000Z',
  },
  {
    comment: 'Inline auth state',
    display: 'silent',
    messageEn: '',
    messageRu: '',
    revision: 3,
    ruleId: 'auth-app-api:GET:/silent:401',
    severity: 'warning',
  },
];

const deletedOverrides: Override[] = [
  {
    comment: 'Removed endpoint',
    display: 'toast',
    messageEn: 'Deleted message',
    messageRu: '',
    revision: 4,
    ruleId: 'legacy-app-api:GET:/removed:410',
    severity: 'warning',
    updatedAt: '2026-07-19T13:00:00.000Z',
  },
  {
    comment: 'Malformed stale row',
    display: 'silent',
    messageEn: '',
    messageRu: '',
    revision: 1,
    ruleId: '',
    severity: 'error',
  },
];

const ok = (items: readonly Override[]) =>
  Promise.resolve({
    data: { data: { items: [...items] } },
    error: undefined,
    response: new Response(null, { status: 200 }),
  });

const TestProviders = ({ children, locale = 'en' }: Readonly<{ children: ReactElement; locale?: Locale }>) => (
  <FrontendStateProvider initialLocale={locale}>
    <FrontendI18nProvider translations={adminFrontendTranslations}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
          })
        }
      >
        {children}
      </QueryClientProvider>
    </FrontendI18nProvider>
  </FrontendStateProvider>
);

const renderPage = ({
  access = writeAccess,
  locale = 'en',
  overrides = activeOverrides,
}: {
  access?: AdminAccess;
  locale?: Locale;
  overrides?: readonly Override[];
} = {}) => {
  vi.spyOn(adminApi, 'adminProblemPresentationsControllerList').mockReturnValue(ok(overrides) as never);
  return render(
    <TestProviders locale={locale}>
      <ProblemPresentationsPage access={access} />
    </TestProviders>,
  );
};

const installRadixPointerMocks = () => {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
};

const chooseSelectOption = (container: HTMLElement, label: string, value: string) => {
  installRadixPointerMocks();
  fireEvent.pointerDown(within(container).getByRole('combobox', { name: label }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
  const option = document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`);
  expect(option).toBeTruthy();
  fireEvent.click(option as HTMLElement);
};

const rowFor = async (text: string): Promise<HTMLElement> => {
  const cell = await screen.findByText(text);
  const row = cell.closest('tr');
  expect(row).toBeTruthy();
  return row as HTMLElement;
};

describe('ProblemPresentationsPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('merges active and deleted rules, filters them, and previews every display path', async () => {
    const toastSpy = vi.spyOn(apiToastRuntime, 'show');
    renderPage({ overrides: [...activeOverrides, ...deletedOverrides] });

    const successRow = await rowFor('/success');
    fireEvent.click(within(successRow).getByRole('button', { name: 'Preview toast' }));
    expect(toastSpy).toHaveBeenLastCalledWith({
      category: 'success',
      message: 'Русский fallback',
      title: 'GET /success',
    });

    const infoRow = await rowFor('/info');
    expect(within(infoRow).getByText(/postInfo/u)).toBeTruthy();
    fireEvent.click(within(infoRow).getByRole('button', { name: 'Preview toast' }));
    expect(toastSpy).toHaveBeenLastCalledWith({
      category: 'info',
      message: 'English info',
      title: 'POST /info',
    });

    const defaultRow = await rowFor('/default');
    fireEvent.click(within(defaultRow).getByRole('button', { name: 'Preview toast' }));
    expect(toastSpy).toHaveBeenLastCalledWith({
      category: 'warning',
      message: 'Generated default message',
      title: 'GET /default',
    });

    const silentRow = await rowFor('/silent');
    fireEvent.click(within(silentRow).getByRole('button', { name: 'Preview toast' }));
    expect(await screen.findByText(/calling form or feature owns its inline error state/u)).toBeTruthy();

    expect((await screen.findAllByText('Deleted from OpenAPI')).length).toBe(2);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    const search = screen.getByRole('textbox', { name: 'Search API responses' });
    fireEvent.change(search, { target: { value: 'DefaultTag' } });
    expect(await screen.findByText('/default')).toBeTruthy();
    fireEvent.change(search, { target: { value: '' } });

    chooseSelectOption(document.body, 'Service', 'auth-app-api');
    expect(await screen.findByText('/silent')).toBeTruthy();
    chooseSelectOption(document.body, 'Display', 'silent');
    expect(await screen.findByText('/silent')).toBeTruthy();
  });

  it('uses Russian copy fallbacks and keeps write controls hidden for read-only admins', async () => {
    const toastSpy = vi.spyOn(apiToastRuntime, 'show');
    renderPage({ access: readAccess, locale: 'ru', overrides: activeOverrides });

    const successRow = await rowFor('/success');
    fireEvent.click(within(successRow).getAllByRole('button')[0]!);
    expect(toastSpy).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Русский fallback' }));

    const infoRow = await rowFor('/info');
    fireEvent.click(within(infoRow).getAllByRole('button')[0]!);
    expect(toastSpy).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'English info' }));
    expect(screen.queryByRole('button', { name: /Edit|Изменить/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reset|Сброс/u })).toBeNull();
  });

  it('edits every field, saves, resets, and closes both dialogs', async () => {
    const updateSpy = vi.spyOn(adminApi, 'adminProblemPresentationsControllerUpdate').mockReturnValue(
      ok([activeOverrides[0]!]).then(({ response }) => ({
        data: { data: activeOverrides[0]! },
        error: undefined,
        response,
      })) as never,
    );
    const resetSpy = vi.spyOn(adminApi, 'adminProblemPresentationsControllerReset').mockResolvedValue({
      data: { data: { ruleId: activeOverrides[0]!.ruleId } },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    renderPage();

    const row = await rowFor('/success');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    let dialog = screen.getByRole('alertdialog');
    chooseSelectOption(dialog, 'Display mode', 'silent');
    chooseSelectOption(dialog, 'Severity', 'warning');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'English toast message' }), {
      target: { value: 'Changed English' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Russian toast message' }), {
      target: { value: 'Изменено' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Internal comment' }), {
      target: { value: 'Changed comment' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save rule' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        {
          comment: 'Changed comment',
          display: 'silent',
          expectedRevision: 1,
          messageEn: 'Changed English',
          messageRu: 'Изменено',
          ruleId: activeOverrides[0]!.ruleId,
          severity: 'warning',
        },
        undefined,
      );
    });
    expect(await screen.findByText(/Presentation rule saved/u)).toBeTruthy();

    fireEvent.click(within(await rowFor('/success')).getByRole('button', { name: 'Edit' }));
    dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(within(await rowFor('/success')).getByRole('button', { name: 'Reset' }));
    dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(within(await rowFor('/success')).getByRole('button', { name: 'Reset' }));
    dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));
    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledWith({ expectedRevision: 1, ruleId: activeOverrides[0]!.ruleId }, undefined);
    });
    expect(await screen.findByText(/reset to its generated default/u)).toBeTruthy();
  });

  it('shows list, update, and reset failures', async () => {
    vi.spyOn(adminApi, 'adminProblemPresentationsControllerList').mockRejectedValueOnce(new Error('list offline'));
    render(
      <TestProviders>
        <ProblemPresentationsPage access={writeAccess} />
      </TestProviders>,
    );
    expect(await screen.findByText('API response presentation overrides could not be loaded.')).toBeTruthy();

    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(adminApi, 'adminProblemPresentationsControllerUpdate').mockRejectedValue(new Error('update rejected'));
    vi.spyOn(adminApi, 'adminProblemPresentationsControllerReset').mockRejectedValue(new Error('reset rejected'));
    renderPage();

    let row = await rowFor('/success');
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save rule' }));
    expect(await screen.findByText('The presentation rule could not be saved.')).toBeTruthy();

    row = await rowFor('/success');
    fireEvent.click(within(row).getByRole('button', { name: 'Reset' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset' }));
    expect(await screen.findByText('The presentation rule could not be reset.')).toBeTruthy();
  });
});
