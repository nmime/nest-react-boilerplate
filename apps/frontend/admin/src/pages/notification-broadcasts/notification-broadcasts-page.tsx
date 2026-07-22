import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import {
  UiButton,
  UiCard,
  UiCheckbox,
  UiDataTable,
  UiInput,
  UiNotification,
  UiSection,
  UiSelect,
  UiStatusTag,
  UiTextarea,
} from '@app/frontend-ui-web';
import type { AdminAccess } from '../../entities/admin-session';
import {
  errorText,
  getDefaultNotificationProvider,
  getNotificationChannelOptions,
  getNotificationProviderOptions,
} from '../../shared';

type BroadcastRow = adminApi.AdminNotificationBroadcastViewDto;
type Channel = adminApi.CreateAdminNotificationBroadcastDto['channel'];
type Provider = adminApi.CreateAdminNotificationBroadcastDto['provider'];
type BroadcastCommand = Parameters<typeof adminApi.adminNotificationsControllerBroadcastCommand>[1];

const parseObject = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid_json');
  }
  return parsed as Record<string, unknown>;
};
const idempotencyKey = () => `admin-ui-${Date.now()}-${globalThis.crypto.randomUUID()}`;

const statusTone = (status: BroadcastRow['status']): 'success' | 'warning' | 'info' => {
  if (status === 'completed') {
    return 'success';
  }
  return status === 'failed' ? 'warning' : 'info';
};

export const NotificationBroadcastsPage = ({
  access,
  requestOptions,
}: Readonly<{ access: AdminAccess; requestOptions?: ApiClientRequestOptions }>) => {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [templateVersionId, setTemplateVersionId] = useState('');
  const [channel, setChannel] = useState<Channel>('email');
  const [provider, setProvider] = useState<Provider>('resend');
  const [priority, setPriority] = useState('0');
  const [variables, setVariables] = useState('{}');
  const [segmentIds, setSegmentIds] = useState<string[]>([]);
  const [scheduleByBroadcast, setScheduleByBroadcast] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' }>();

  const broadcasts = useQuery({
    queryKey: [...adminApi.getAdminNotificationBroadcastsQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminNotificationsControllerListBroadcasts(requestOptions)),
    refetchInterval: 5_000,
    retry: false,
  });
  const templates = useQuery({
    queryKey: [...adminApi.getAdminNotificationTemplatesQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminNotificationsControllerListTemplates(requestOptions)),
    retry: false,
  });
  const segments = useQuery({
    queryKey: [...adminApi.getAdminNotificationSegmentsQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminNotificationsControllerListSegments(requestOptions)),
    retry: false,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: adminApi.getAdminNotificationBroadcastsQueryKey() });
  const succeed = async () => {
    setNotice({ message: t('admin.notification.common.success'), tone: 'success' });
    await invalidate();
  };
  const fail = (error: unknown) => {
    setNotice({ message: errorText(error, 'admin.notification.common.failed', t), tone: 'warning' });
  };
  const createMutation = useMutation({
    mutationFn: (body: adminApi.CreateAdminNotificationBroadcastDto) =>
      throwOnOpenApiErrorData(adminApi.adminNotificationsControllerCreateBroadcast(body, requestOptions)),
    onSuccess: succeed,
    onError: fail,
  });
  const commandMutation = useMutation({
    mutationFn: ({ id, command }: { id: string; command: BroadcastCommand }) =>
      throwOnOpenApiErrorData(
        adminApi.adminNotificationsControllerBroadcastCommand(id, command, idempotencyKey(), requestOptions),
      ),
    onSuccess: succeed,
    onError: fail,
  });
  const scheduleMutation = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      throwOnOpenApiErrorData(
        adminApi.adminNotificationsControllerScheduleBroadcast(
          id,
          { scheduledAt: new Date(scheduledAt).toISOString() },
          idempotencyKey(),
          requestOptions,
        ),
      ),
    onSuccess: succeed,
    onError: fail,
  });

  const selectChannel = (value: string) => {
    const next = value as Channel;
    setChannel(next);
    const nextProvider = getDefaultNotificationProvider(next);
    if (nextProvider) {
      setProvider(nextProvider);
    }
  };
  const create = () => {
    try {
      createMutation.mutate({
        channel,
        globalVariables: parseObject(variables),
        name,
        priority: Number(priority),
        provider,
        segmentIds,
        templateVersionId,
      });
    } catch {
      setNotice({ message: t('admin.notification.common.invalidJson'), tone: 'warning' });
    }
  };
  const toggleSegment = (id: string, checked: boolean) => {
    setSegmentIds((current) => (checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)));
  };
  const templateOptions = (templates.data?.items ?? []).flatMap((template) =>
    template.versions
      .filter((version) => Boolean(version.publishedAt))
      .map((version) => ({ label: `${template.name} · v${version.version}`, value: version.id })),
  );
  const rows = broadcasts.data?.items ?? [];

  return (
    <UiSection
      className="admin-page admin-notification-page"
      eyebrow={t('admin.notification.broadcasts.eyebrow')}
      title={t('admin.notification.broadcasts.title')}
    >
      <p className="admin-page-description">{t('admin.notification.description')}</p>
      {notice ? <UiNotification message={notice.message} tone={notice.tone} /> : null}
      {access.canWriteNotificationBroadcasts ? (
        <UiCard className="admin-filter-card" title={t('admin.notification.broadcasts.create')}>
          <div className="admin-notification-form-grid">
            <UiInput
              aria-label={t('admin.notification.templates.name')}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder={t('admin.notification.templates.name')}
              value={name}
            />
            <UiSelect
              label={t('admin.notification.broadcasts.templateVersion')}
              onValueChange={setTemplateVersionId}
              options={templateOptions}
              placeholder={t('admin.notification.broadcasts.templateVersion')}
              value={templateVersionId}
            />
            <UiSelect
              label={t('admin.notification.templates.channel')}
              onValueChange={selectChannel}
              options={getNotificationChannelOptions(t)}
              value={channel}
            />
            <UiSelect
              label={t('admin.notification.templates.provider')}
              onValueChange={(value) => {
                setProvider(value as Provider);
              }}
              options={getNotificationProviderOptions(channel, t)}
              value={provider}
            />
            <UiInput
              aria-label={t('admin.notification.broadcasts.priority')}
              max={10}
              min={0}
              onChange={(event) => {
                setPriority(event.target.value);
              }}
              type="number"
              value={priority}
            />
            <UiTextarea
              aria-label={t('admin.notification.broadcasts.variables')}
              onChange={(event) => {
                setVariables(event.target.value);
              }}
              value={variables}
            />
          </div>
          <div
            className="admin-notification-segment-picker"
            role="group"
            aria-label={t('admin.notification.broadcasts.segments')}
          >
            {(segments.data?.items ?? []).map((segment) => (
              <UiCheckbox
                checked={segmentIds.includes(segment.id)}
                key={segment.id}
                label={`${segment.name} (${segment.memberCount})`}
                onCheckedChange={(checked) => {
                  toggleSegment(segment.id, checked === true);
                }}
              />
            ))}
          </div>
          <UiButton
            disabled={!name || !templateVersionId || segmentIds.length === 0 || createMutation.isPending}
            onClick={create}
          >
            {t('admin.notification.common.save')}
          </UiButton>
        </UiCard>
      ) : null}
      <UiCard className="admin-table-card" title={t('admin.notification.broadcasts.title')}>
        <UiDataTable<BroadcastRow>
          columns={[
            {
              id: 'name',
              header: t('admin.notification.templates.name'),
              render: (row) => (
                <div className="admin-notification-cell">
                  <strong>{row.name}</strong>
                  <small>
                    {row.channel} · {row.provider} · P{row.priority}
                  </small>
                </div>
              ),
            },
            {
              id: 'status',
              header: t('admin.notification.common.status'),
              render: (row) => <UiStatusTag label={row.status} tone={statusTone(row.status)} />,
            },
            {
              id: 'audience',
              header: t('admin.notification.broadcasts.snapshot'),
              render: (row) => row.snapshotCount.toLocaleString(),
            },
            {
              id: 'delivery',
              header: t('admin.notification.broadcasts.sent'),
              render: (row) => `${row.sentCount}/${row.queuedCount}`,
            },
            {
              id: 'errors',
              header: t('admin.notification.broadcasts.errors'),
              render: (row) => `${row.errorCount + row.rejectedCount}`,
            },
            {
              id: 'actions',
              header: t('admin.notification.common.actions'),
              render: (row) => (
                <div className="admin-notification-broadcast-actions">
                  {access.canWriteNotificationBroadcasts ? (
                    <UiButton
                      variant="ghost"
                      onClick={() => {
                        commandMutation.mutate({ id: row.id, command: 'collect-audience' });
                      }}
                    >
                      {t('admin.notification.broadcasts.collect')}
                    </UiButton>
                  ) : null}
                  {access.canApproveNotificationBroadcasts ? (
                    <UiButton
                      variant="ghost"
                      onClick={() => {
                        commandMutation.mutate({ id: row.id, command: 'approve' });
                      }}
                    >
                      {t('admin.notification.broadcasts.approve')}
                    </UiButton>
                  ) : null}
                  {access.canSendNotificationBroadcasts ? (
                    <>
                      <UiButton
                        variant="ghost"
                        onClick={() => {
                          commandMutation.mutate({ id: row.id, command: 'send' });
                        }}
                      >
                        {t('admin.notification.broadcasts.send')}
                      </UiButton>
                      <div className="admin-notification-schedule">
                        <UiInput
                          aria-label={t('admin.notification.broadcasts.scheduledAt')}
                          onChange={(event) => {
                            setScheduleByBroadcast((current) => ({ ...current, [row.id]: event.target.value }));
                          }}
                          type="datetime-local"
                          value={scheduleByBroadcast[row.id] ?? ''}
                        />
                        <UiButton
                          disabled={!scheduleByBroadcast[row.id]}
                          variant="ghost"
                          onClick={() => {
                            scheduleMutation.mutate({ id: row.id, scheduledAt: scheduleByBroadcast[row.id] ?? '' });
                          }}
                        >
                          {t('admin.notification.broadcasts.schedule')}
                        </UiButton>
                      </div>
                      <UiButton
                        variant="ghost"
                        onClick={() => {
                          commandMutation.mutate({ id: row.id, command: 'pause' });
                        }}
                      >
                        {t('admin.notification.broadcasts.pause')}
                      </UiButton>
                      <UiButton
                        variant="ghost"
                        onClick={() => {
                          commandMutation.mutate({ id: row.id, command: 'resume' });
                        }}
                      >
                        {t('admin.notification.broadcasts.resume')}
                      </UiButton>
                      <UiButton
                        variant="ghost"
                        onClick={() => {
                          commandMutation.mutate({ id: row.id, command: 'cancel' });
                        }}
                      >
                        {t('admin.notification.broadcasts.cancel')}
                      </UiButton>
                    </>
                  ) : null}
                </div>
              ),
            },
          ]}
          emptyDescription={t('admin.notification.common.empty')}
          emptyTitle={t('admin.notification.common.empty')}
          error={broadcasts.error ? errorText(broadcasts.error, 'admin.notification.common.failed', t) : undefined}
          isLoading={broadcasts.isLoading}
          loadingLabel={t('admin.notification.common.loading')}
          rowKey={(row) => row.id}
          rows={rows}
        />
      </UiCard>
    </UiSection>
  );
};
