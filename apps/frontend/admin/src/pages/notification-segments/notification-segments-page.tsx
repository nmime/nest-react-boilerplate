import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import {
  UiButton,
  UiCard,
  UiDataTable,
  UiInput,
  UiNotification,
  UiSection,
  UiSelect,
  UiStatusTag,
  UiTextarea,
} from '@app/frontend-ui-web';
import type { AdminAccess } from '../../entities/admin-session';
import { errorText, getNotificationSegmentKindOptions } from '../../shared';

type SegmentRow = adminApi.AdminNotificationSegmentViewDto;
type SegmentKind = adminApi.CreateAdminNotificationSegmentDto['kind'];

const parseObject = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid_json');
  }
  return parsed as Record<string, unknown>;
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error('file_read_failed'));
    };
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      const separator = value.indexOf(',');
      resolve(separator >= 0 ? value.slice(separator + 1) : value);
    };
    reader.readAsDataURL(file);
  });

export const NotificationSegmentsPage = ({
  access,
  requestOptions,
}: Readonly<{ access: AdminAccess; requestOptions?: ApiClientRequestOptions }>) => {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SegmentKind>('dynamic');
  const [resolverKey, setResolverKey] = useState('auth-users');
  const [parameters, setParameters] = useState('{}');
  const [uploads, setUploads] = useState<Record<string, File | undefined>>({});
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' }>();

  const segments = useQuery({
    queryKey: [...adminApi.getAdminNotificationSegmentsQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminNotificationsControllerListSegments(requestOptions)),
    retry: false,
  });
  const resolvers = useQuery({
    queryKey: [...adminApi.getAdminNotificationResolversQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminNotificationsControllerListResolvers(requestOptions)),
    retry: false,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminApi.getAdminNotificationSegmentsQueryKey() });
  const succeed = async (message = t('admin.notification.common.success')) => {
    setNotice({ message, tone: 'success' });
    await invalidate();
  };
  const fail = (error: unknown) => {
    setNotice({ message: errorText(error, 'admin.notification.common.failed', t), tone: 'warning' });
  };

  const createMutation = useMutation({
    mutationFn: (body: adminApi.CreateAdminNotificationSegmentDto) =>
      throwOnOpenApiErrorData(adminApi.adminNotificationsControllerCreateSegment(body, requestOptions)),
    onSuccess: () => succeed(),
    onError: fail,
  });
  const estimateMutation = useMutation({
    mutationFn: (id: string) =>
      throwOnOpenApiErrorData(adminApi.adminNotificationsControllerEstimateSegment(id, requestOptions)),
    onSuccess: (result) => succeed(`${t('admin.notification.segments.estimate')}: ${result.count}`),
    onError: fail,
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      throwOnOpenApiErrorData(adminApi.adminNotificationsControllerArchiveSegment(id, requestOptions)),
    onSuccess: () => succeed(),
    onError: fail,
  });
  const uploadMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) =>
      throwOnOpenApiErrorData(
        adminApi.adminNotificationsControllerUploadSegment(
          id,
          { contentBase64: await fileToBase64(file), filename: file.name },
          requestOptions,
        ),
      ),
    onSuccess: (result) => succeed(`${t('admin.notification.segments.upload')}: ${result.status}`),
    onError: fail,
  });

  const create = () => {
    try {
      createMutation.mutate({
        kind,
        name,
        parameters: parseObject(parameters),
        ...(kind === 'dynamic' ? { resolverKey } : {}),
      });
    } catch {
      setNotice({ message: t('admin.notification.common.invalidJson'), tone: 'warning' });
    }
  };
  const rows = segments.data?.items ?? [];
  const resolverOptions = (resolvers.data?.items ?? []).map((resolver) => ({
    label: resolver.label,
    value: resolver.key,
  }));

  return (
    <UiSection
      className="admin-page admin-notification-page"
      eyebrow={t('admin.notification.segments.eyebrow')}
      title={t('admin.notification.segments.title')}
    >
      <p className="admin-page-description">{t('admin.notification.description')}</p>
      {notice ? <UiNotification message={notice.message} tone={notice.tone} /> : null}
      {access.canWriteNotificationSegments ? (
        <UiCard className="admin-filter-card" title={t('admin.notification.segments.create')}>
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
              label={t('admin.notification.segments.kind')}
              onValueChange={(value) => {
                setKind(value as SegmentKind);
              }}
              options={getNotificationSegmentKindOptions(t)}
              value={kind}
            />
            {kind === 'dynamic' ? (
              <UiSelect
                label={t('admin.notification.segments.resolver')}
                onValueChange={setResolverKey}
                options={
                  resolverOptions.length
                    ? resolverOptions
                    : [{ label: t('admin.notification.option.segment.authUsers'), value: 'auth-users' }]
                }
                value={resolverKey}
              />
            ) : null}
            <UiTextarea
              aria-label={t('admin.notification.segments.parameters')}
              onChange={(event) => {
                setParameters(event.target.value);
              }}
              value={parameters}
            />
          </div>
          <UiButton disabled={!name || createMutation.isPending} onClick={create}>
            {t('admin.notification.common.save')}
          </UiButton>
        </UiCard>
      ) : null}
      <UiCard className="admin-table-card" title={t('admin.notification.segments.title')}>
        <p className="admin-page-description">{t('admin.notification.segments.csvHelp')}</p>
        <UiDataTable<SegmentRow>
          columns={[
            {
              id: 'name',
              header: t('admin.notification.templates.name'),
              render: (row) => (
                <div className="admin-notification-cell">
                  <strong>{row.name}</strong>
                  <small>
                    {row.kind}
                    {typeof row.resolverKey === 'string' ? ` · ${row.resolverKey}` : ''}
                  </small>
                </div>
              ),
            },
            {
              id: 'status',
              header: t('admin.notification.common.status'),
              render: (row) => <UiStatusTag label={row.status} tone={row.status === 'active' ? 'success' : 'info'} />,
            },
            {
              id: 'members',
              header: t('admin.notification.segments.members'),
              render: (row) => row.memberCount.toLocaleString(),
            },
            {
              id: 'actions',
              header: t('admin.notification.common.actions'),
              render: (row) => (
                <div className="admin-notification-segment-actions">
                  <div className="admin-row-actions">
                    <UiButton
                      variant="ghost"
                      onClick={() => {
                        estimateMutation.mutate(row.id);
                      }}
                    >
                      {t('admin.notification.segments.estimate')}
                    </UiButton>
                    {access.canWriteNotificationSegments ? (
                      <UiButton
                        variant="ghost"
                        onClick={() => {
                          archiveMutation.mutate(row.id);
                        }}
                      >
                        {t('admin.notification.templates.archive')}
                      </UiButton>
                    ) : null}
                  </div>
                  {access.canWriteNotificationSegments && row.kind === 'static' ? (
                    <div className="admin-notification-upload">
                      <UiInput
                        accept=".csv,text/csv"
                        aria-label={t('admin.notification.segments.upload')}
                        onChange={(event) => {
                          setUploads((current) => ({ ...current, [row.id]: event.target.files?.[0] }));
                        }}
                        type="file"
                      />
                      <UiButton
                        disabled={!uploads[row.id] || uploadMutation.isPending}
                        variant="ghost"
                        onClick={() => {
                          const file = uploads[row.id];
                          if (file) {
                            uploadMutation.mutate({ id: row.id, file });
                          }
                        }}
                      >
                        {t('admin.notification.segments.upload')}
                      </UiButton>
                    </div>
                  ) : null}
                </div>
              ),
            },
          ]}
          emptyDescription={t('admin.notification.common.empty')}
          emptyTitle={t('admin.notification.common.empty')}
          error={segments.error ? errorText(segments.error, 'admin.notification.common.failed', t) : undefined}
          isLoading={segments.isLoading}
          loadingLabel={t('admin.notification.common.loading')}
          rowKey={(row) => row.id}
          rows={rows}
        />
      </UiCard>
    </UiSection>
  );
};
