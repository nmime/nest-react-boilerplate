import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import {
  UiButton,
  UiCard,
  UiDataTable,
  UiNotification,
  UiSection,
  UiSelect,
  UiStatusTag,
  UiTextField,
  UiTextareaField,
} from '@app/frontend-ui-web';
import type { AdminAccess } from '../../entities/admin-session';
import {
  errorText,
  getDefaultNotificationProvider,
  getNotificationChannelOptions,
  getNotificationProviderOptions,
} from '../../shared';

type Channel = adminApi.AdminNotificationTemplateChannelInputDto['channel'];
type Provider = adminApi.TestSendAdminNotificationTemplateDto['provider'];
type TemplateRow = adminApi.AdminNotificationTemplateViewDto;

const parseObject = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid_json');
  }
  return parsed as Record<string, unknown>;
};

const targetTypeForProvider = (provider: Provider): adminApi.TestSendAdminNotificationTemplateDto['targetType'] => {
  if (provider === 'resend' || provider === 'mailpace') {
    return 'email';
  }
  if (provider === 'google-fcm' || provider === 'apple-apns') {
    return 'push-token';
  }
  return provider === 'telegram-bot' ? 'telegram-chat' : 'user';
};

export const NotificationTemplatesPage = ({
  access,
  requestOptions,
}: Readonly<{ access: AdminAccess; requestOptions?: ApiClientRequestOptions }>) => {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState<Channel>('email');
  const [subjectEn, setSubjectEn] = useState('');
  const [subjectRu, setSubjectRu] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [bodyRu, setBodyRu] = useState('');
  const [htmlEn, setHtmlEn] = useState('');
  const [htmlRu, setHtmlRu] = useState('');
  const [image, setImage] = useState('');
  const [schema, setSchema] = useState('{}');
  const [previewVariables, setPreviewVariables] = useState('{}');
  const [target, setTarget] = useState('');
  const [provider, setProvider] = useState<Provider>('resend');
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' }>();

  const templates = useQuery({
    queryKey: [...adminApi.getAdminNotificationTemplatesQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminNotificationsControllerListTemplates(requestOptions)),
    retry: false,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: adminApi.getAdminNotificationTemplatesQueryKey() });
  const succeed = async () => {
    setNotice({ message: t('admin.notification.common.success'), tone: 'success' });
    await invalidate();
  };
  const fail = (error: unknown) => {
    setNotice({ message: errorText(error, 'admin.notification.common.failed', t), tone: 'warning' });
  };

  const createMutation = useMutation({
    mutationFn: (body: adminApi.CreateAdminNotificationTemplateDto) =>
      throwOnOpenApiErrorData(adminApi.adminNotificationsControllerCreateTemplate(body, requestOptions)),
    onSuccess: succeed,
    onError: fail,
  });
  const commandMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'archive' | 'publish' }) =>
      throwOnOpenApiErrorData(
        action === 'publish'
          ? adminApi.adminNotificationsControllerPublishTemplate(id, requestOptions)
          : adminApi.adminNotificationsControllerArchiveTemplate(id, requestOptions),
      ),
    onSuccess: succeed,
    onError: fail,
  });
  const previewMutation = useMutation({
    mutationFn: ({ id, test }: { id: string; test: boolean }) => {
      const variables = parseObject(previewVariables);
      if (test) {
        return throwOnOpenApiErrorData(
          adminApi.adminNotificationsControllerTestSend(
            id,
            {
              channel: channel === 'in_app' ? 'email' : channel,
              language: 'en',
              provider,
              targetId: target,
              targetType: targetTypeForProvider(provider),
              variables,
            },
            requestOptions,
          ),
        );
      }
      return throwOnOpenApiErrorData(
        adminApi.adminNotificationsControllerPreviewTemplate(
          id,
          { channel: channel === 'in_app' ? 'email' : channel, language: 'en', variables },
          requestOptions,
        ),
      );
    },
    onSuccess: (result) => {
      setNotice({ message: JSON.stringify(result.message), tone: 'success' });
    },
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
  const buildContent = (): Record<string, unknown> => {
    const content: Record<string, unknown> = { body: { en: bodyEn, ru: bodyRu } };
    if (channel === 'email') {
      content['subject'] = { en: subjectEn, ru: subjectRu };
      if (htmlEn || htmlRu) {
        content['html'] = { en: htmlEn, ru: htmlRu };
      }
    } else {
      if (subjectEn || subjectRu) {
        content['subject'] = { en: subjectEn, ru: subjectRu };
      }
      if (image) {
        content['image'] = { en: image, ru: image };
      }
    }
    return content;
  };
  const create = () => {
    try {
      createMutation.mutate({
        channels: [{ channel, content: buildContent(), engine: 'string-format' }],
        code,
        description: description || undefined,
        name,
        variablesSchema: parseObject(schema),
      });
    } catch {
      setNotice({ message: t('admin.notification.common.invalidJson'), tone: 'warning' });
    }
  };

  const rows = templates.data?.items ?? [];
  return (
    <UiSection
      className="admin-page admin-notification-page"
      eyebrow={t('admin.notification.templates.eyebrow')}
      headingLevel={1}
      title={t('admin.notification.templates.title')}
    >
      <p className="admin-page-description">{t('admin.notification.description')}</p>
      {notice ? <UiNotification message={notice.message} tone={notice.tone} /> : null}
      {access.canWriteNotificationTemplates ? (
        <UiCard className="admin-filter-card" title={t('admin.notification.templates.create')}>
          <div className="admin-notification-form-grid">
            <UiTextField
              label={t('admin.notification.templates.code')}
              onChange={(e) => {
                setCode(e.target.value);
              }}
              placeholder={t('admin.notification.templates.code')}
              value={code}
            />
            <UiTextField
              label={t('admin.notification.templates.name')}
              onChange={(e) => {
                setName(e.target.value);
              }}
              placeholder={t('admin.notification.templates.name')}
              value={name}
            />
            <UiTextField
              label={t('admin.notification.templates.description')}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
              placeholder={t('admin.notification.templates.description')}
              value={description}
            />
            <UiSelect
              label={t('admin.notification.templates.channel')}
              onValueChange={selectChannel}
              options={getNotificationChannelOptions(t)}
              value={channel}
            />
            {channel !== 'bot' ? (
              <UiTextField
                label={t('admin.notification.templates.subjectEn')}
                onChange={(e) => {
                  setSubjectEn(e.target.value);
                }}
                placeholder={t('admin.notification.templates.subjectEn')}
                value={subjectEn}
              />
            ) : null}
            {channel !== 'bot' ? (
              <UiTextField
                label={t('admin.notification.templates.subjectRu')}
                onChange={(e) => {
                  setSubjectRu(e.target.value);
                }}
                placeholder={t('admin.notification.templates.subjectRu')}
                value={subjectRu}
              />
            ) : null}
            <UiTextareaField
              label={t('admin.notification.templates.bodyEn')}
              onChange={(e) => {
                setBodyEn(e.target.value);
              }}
              placeholder={t('admin.notification.templates.bodyEn')}
              value={bodyEn}
            />
            <UiTextareaField
              label={t('admin.notification.templates.bodyRu')}
              onChange={(e) => {
                setBodyRu(e.target.value);
              }}
              placeholder={t('admin.notification.templates.bodyRu')}
              value={bodyRu}
            />
            {channel === 'email' ? (
              <UiTextareaField
                label={t('admin.notification.templates.htmlEn')}
                onChange={(e) => {
                  setHtmlEn(e.target.value);
                }}
                placeholder={t('admin.notification.templates.htmlEn')}
                value={htmlEn}
              />
            ) : null}
            {channel === 'email' ? (
              <UiTextareaField
                label={t('admin.notification.templates.htmlRu')}
                onChange={(e) => {
                  setHtmlRu(e.target.value);
                }}
                placeholder={t('admin.notification.templates.htmlRu')}
                value={htmlRu}
              />
            ) : null}
            {channel !== 'email' ? (
              <UiTextField
                label={t('admin.notification.templates.image')}
                onChange={(e) => {
                  setImage(e.target.value);
                }}
                placeholder={t('admin.notification.templates.image')}
                value={image}
              />
            ) : null}
            <UiTextareaField
              label={t('admin.notification.templates.schema')}
              onChange={(e) => {
                setSchema(e.target.value);
              }}
              placeholder={t('admin.notification.templates.schema')}
              value={schema}
            />
          </div>
          <UiButton disabled={!code || !name || !bodyEn || createMutation.isPending} onClick={create}>
            {t('admin.notification.common.save')}
          </UiButton>
        </UiCard>
      ) : null}
      <UiCard className="admin-table-card" title={t('admin.notification.templates.title')}>
        <div className="admin-notification-testbar">
          <UiTextareaField
            label={t('admin.notification.templates.previewVariables')}
            onChange={(e) => {
              setPreviewVariables(e.target.value);
            }}
            value={previewVariables}
          />
          <UiSelect
            label={t('admin.notification.templates.provider')}
            onValueChange={(value) => {
              setProvider(value as Provider);
            }}
            options={getNotificationProviderOptions(channel, t)}
            value={provider}
          />
          <UiTextField
            label={t('admin.notification.templates.target')}
            onChange={(e) => {
              setTarget(e.target.value);
            }}
            placeholder={t('admin.notification.templates.target')}
            value={target}
          />
        </div>
        <UiDataTable<TemplateRow>
          columns={[
            {
              id: 'name',
              header: t('admin.notification.templates.name'),
              render: (row) => (
                <div className="admin-notification-cell">
                  <strong>{row.name}</strong>
                  <small>{row.code}</small>
                </div>
              ),
            },
            {
              id: 'status',
              header: t('admin.notification.common.status'),
              render: (row) => (
                <UiStatusTag label={row.status} tone={row.status === 'published' ? 'success' : 'info'} />
              ),
            },
            {
              id: 'version',
              header: t('admin.notification.templates.version'),
              render: (row) => `${row.versions.at(-1)?.version ?? '—'}`,
            },
            { id: 'source', header: t('admin.notification.templates.source'), render: (row) => row.source },
            {
              id: 'actions',
              header: t('admin.notification.common.actions'),
              render: (row) => (
                <div className="admin-row-actions">
                  <UiButton
                    variant="ghost"
                    onClick={() => {
                      previewMutation.mutate({ id: row.id, test: false });
                    }}
                  >
                    {t('admin.notification.templates.preview')}
                  </UiButton>
                  {access.canTestNotificationTemplates ? (
                    <UiButton
                      variant="ghost"
                      disabled={!target}
                      onClick={() => {
                        previewMutation.mutate({ id: row.id, test: true });
                      }}
                    >
                      {t('admin.notification.templates.test')}
                    </UiButton>
                  ) : null}
                  {access.canWriteNotificationTemplates && row.source === 'admin' ? (
                    <>
                      <UiButton
                        variant="ghost"
                        onClick={() => {
                          commandMutation.mutate({ id: row.id, action: 'publish' });
                        }}
                      >
                        {t('admin.notification.templates.publish')}
                      </UiButton>
                      <UiButton
                        variant="ghost"
                        onClick={() => {
                          commandMutation.mutate({ id: row.id, action: 'archive' });
                        }}
                      >
                        {t('admin.notification.templates.archive')}
                      </UiButton>
                    </>
                  ) : null}
                </div>
              ),
            },
          ]}
          emptyDescription={t('admin.notification.common.empty')}
          emptyTitle={t('admin.notification.common.empty')}
          error={templates.error ? errorText(templates.error, 'admin.notification.common.failed', t) : undefined}
          isLoading={templates.isLoading}
          loadingLabel={t('admin.notification.common.loading')}
          rowKey={(row) => row.id}
          rows={rows}
        />
      </UiCard>
    </UiSection>
  );
};
