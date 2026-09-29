/* eslint-disable no-await-in-loop -- Lifecycle commands must settle before the next command is issued. */
// @requirements REQ-FRONTEND-SHELL-004
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '@app/frontend-api-client';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { createAdminAccess } from '../entities/admin-session';
import { NotificationTemplatesPage } from '../pages/notification-templates';
import { NotificationSegmentsPage } from '../pages/notification-segments';
import { NotificationBroadcastsPage } from '../pages/notification-broadcasts';

const access = createAdminAccess({ subject: 'admin', roles: ['admin'], permissions: ['admin:manage:all'] });
const requestOptions = { baseUrl: 'https://admin.example.test' };
const result = (data: unknown) => ({ data, error: undefined, response: new Response(null, { status: 200 }) });
const mock = (method: keyof typeof adminApi, data: unknown = {}) =>
  vi.spyOn(adminApi, method as never).mockResolvedValue(result(data) as never);
const setup = (element: ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FrontendStateProvider>
      <FrontendI18nProvider translations={adminFrontendTranslations}>
        <QueryClientProvider client={client}>{element}</QueryClientProvider>
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );
};
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const template = {
  id: 'template',
  code: 'welcome',
  name: 'Welcome template',
  status: 'published',
  source: 'admin',
  versions: [{ id: 'version', version: 1, publishedAt: '2026-09-01T00:00:00Z' }],
};
const segment = { id: 'segment', name: 'Imported audience', status: 'active', kind: 'static', memberCount: 3 };
afterEach(() => {
  vi.restoreAllMocks();
});

describe('notification administration workflows', () => {
  it('creates localized email content, validates JSON and previews/tests/publishes/archives a template', async () => {
    mock('adminNotificationsControllerListTemplates', { items: [template] });
    const create = mock('adminNotificationsControllerCreateTemplate');
    const preview = mock('adminNotificationsControllerPreviewTemplate', { message: 'Previewed message' });
    const testSend = mock('adminNotificationsControllerTestSend', { message: 'Test queued' });
    const publish = mock('adminNotificationsControllerPublishTemplate');
    const archive = mock('adminNotificationsControllerArchiveTemplate');
    setup(<NotificationTemplatesPage access={access} requestOptions={requestOptions} />);
    await screen.findByText('Welcome template');
    fill('Template code', 'new-code');
    fill('Name', 'Localized greeting');
    fill('Description', 'A greeting');
    fill('English subject', 'Hello');
    fill('Russian subject', 'Привет');
    fill('English body', 'Hello {name}');
    fill('Russian body', 'Привет {name}');
    fill('English HTML (email, optional)', '<b>Hello {name}</b>');
    fill('Russian HTML (email, optional)', '<b>Привет {name}</b>');
    fill('Variables schema (JSON)', '[]');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter valid JSON before continuing.')).toBeDefined();
    expect(create).not.toHaveBeenCalled();
    fill('Variables schema (JSON)', '{"type":"object"}');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'new-code',
          variablesSchema: { type: 'object' },
          channels: [
            expect.objectContaining({
              channel: 'email',
              content: {
                body: { en: 'Hello {name}', ru: 'Привет {name}' },
                subject: { en: 'Hello', ru: 'Привет' },
                html: { en: '<b>Hello {name}</b>', ru: '<b>Привет {name}</b>' },
              },
            }),
          ],
        }),
        requestOptions,
      );
    });
    fill('Preview variables (JSON)', '{"name":"Ada"}');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => {
      expect(preview).toHaveBeenCalledWith(
        'template',
        { channel: 'email', language: 'en', variables: { name: 'Ada' } },
        requestOptions,
      );
    });
    fill('Test recipient', 'member@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Send test' }));
    await waitFor(() => {
      expect(testSend).toHaveBeenCalledWith(
        'template',
        expect.objectContaining({ targetType: 'email', targetId: 'member@example.test', provider: 'resend' }),
        requestOptions,
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith('template', requestOptions);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => {
      expect(archive).toHaveBeenCalledWith('template', requestOptions);
    });
    preview.mockRejectedValueOnce(new Error('Preview unavailable') as never);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('Notification operation failed.')).toBeDefined();
    expect(screen.queryByText('Preview unavailable')).toBeNull();
  });

  it('creates dynamic segments, estimates membership and uploads a real CSV file', async () => {
    mock('adminNotificationsControllerListSegments', { items: [segment] });
    mock('adminNotificationsControllerListResolvers', { items: [{ key: 'auth-users', label: 'Auth users' }] });
    const create = mock('adminNotificationsControllerCreateSegment');
    const estimate = mock('adminNotificationsControllerEstimateSegment', { count: 3 });
    const archive = mock('adminNotificationsControllerArchiveSegment');
    const upload = mock('adminNotificationsControllerUploadSegment', { status: 'accepted' });
    setup(<NotificationSegmentsPage access={access} requestOptions={requestOptions} />);
    await screen.findByText('Imported audience');
    fill('Name', 'Active users');
    fill('Resolver parameters (JSON)', 'null');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter valid JSON before continuing.')).toBeDefined();
    expect(create).not.toHaveBeenCalled();
    fill('Resolver parameters (JSON)', '{"status":"active"}');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        { name: 'Active users', kind: 'dynamic', resolverKey: 'auth-users', parameters: { status: 'active' } },
        requestOptions,
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Estimate' }));
    await waitFor(() => {
      expect(estimate).toHaveBeenCalledWith('segment', requestOptions);
    });
    const csv = 'target_id,language\nmember@example.test,en\n';
    fireEvent.change(screen.getByLabelText('Upload CSV'), {
      target: { files: [new File([csv], 'audience.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Upload CSV' }));
    await waitFor(() => {
      expect(upload).toHaveBeenCalledWith(
        'segment',
        { filename: 'audience.csv', contentBase64: Buffer.from(csv).toString('base64') },
        requestOptions,
      );
    });
    archive.mockRejectedValueOnce(new Error('Archive unavailable') as never);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('Notification operation failed.')).toBeDefined();
    expect(screen.queryByText('Archive unavailable')).toBeNull();
  });

  it('issues lifecycle commands with distinct idempotency keys and schedules an ISO timestamp', async () => {
    const broadcast = {
      id: 'broadcast',
      name: 'Campaign',
      status: 'completed',
      channel: 'email',
      provider: 'resend',
      priority: 1,
      snapshotCount: 3,
      sentCount: 2,
      queuedCount: 3,
      errorCount: 1,
      rejectedCount: 0,
    };
    mock('adminNotificationsControllerListBroadcasts', {
      items: [broadcast, { ...broadcast, id: 'failed', name: 'Failed campaign', status: 'failed' }],
    });
    mock('adminNotificationsControllerListTemplates', { items: [template] });
    mock('adminNotificationsControllerListSegments', { items: [segment] });
    const command = mock('adminNotificationsControllerBroadcastCommand');
    const schedule = mock('adminNotificationsControllerScheduleBroadcast');
    setup(<NotificationBroadcastsPage access={access} requestOptions={requestOptions} />);
    await screen.findByText('Campaign');
    for (const [label, value] of [
      ['Collect audience', 'collect-audience'],
      ['Approve', 'approve'],
      ['Send now', 'send'],
      ['Pause', 'pause'],
      ['Resume', 'resume'],
      ['Cancel', 'cancel'],
    ]) {
      fireEvent.click(screen.getAllByRole('button', { name: label })[0]!);
      await waitFor(() => {
        expect(command).toHaveBeenLastCalledWith(
          'broadcast',
          value,
          expect.stringMatching(/^admin-ui-/u),
          requestOptions,
        );
      });
    }
    expect(new Set(command.mock.calls.map((call) => call[2])).size).toBe(6);
    fireEvent.change(screen.getAllByLabelText('Scheduled time')[0]!, { target: { value: '2026-10-01T12:30' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Schedule' })[0]!);
    await waitFor(() => {
      expect(schedule).toHaveBeenCalledWith(
        'broadcast',
        { scheduledAt: new Date('2026-10-01T12:30').toISOString() },
        expect.stringMatching(/^admin-ui-/u),
        requestOptions,
      );
    });
    schedule.mockRejectedValueOnce(new Error('Schedule unavailable') as never);
    fireEvent.click(screen.getAllByRole('button', { name: 'Schedule' })[0]!);
    expect(await screen.findByText('Notification operation failed.')).toBeDefined();
    expect(screen.queryByText('Schedule unavailable')).toBeNull();
  });

  it('hides write, approval and delivery actions for read-only operators', async () => {
    const readOnly = createAdminAccess({ subject: 'reader', permissions: ['admin:notifications:templates:read'] });
    mock('adminNotificationsControllerListTemplates', {
      items: [template, { ...template, id: 'source', source: 'code', versions: [] }],
    });
    setup(<NotificationTemplatesPage access={readOnly} />);
    await screen.findAllByText('Welcome template');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send test' })).toBeNull();
  });
});
