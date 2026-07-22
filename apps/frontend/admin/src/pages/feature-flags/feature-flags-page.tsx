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
  UiSwitch,
  UiTextField,
  UiTextareaField,
} from '@app/frontend-ui-web';
import type { AdminAccess } from '../../entities/admin-session';
import { errorText } from '../../shared';

type FeatureFlag = adminApi.AdminFeatureFlagViewDto;
type ValueType = 'boolean' | 'number' | 'string';

export const valueTypeFor = (value: FeatureFlag['value']): ValueType => {
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  return typeof value === 'number' ? 'number' : 'string';
};

export const FeatureFlagsPage = ({
  access,
  requestOptions,
}: Readonly<{ access: AdminAccess; requestOptions?: ApiClientRequestOptions }>) => {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string>();
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [valueType, setValueType] = useState<ValueType>('boolean');
  const [rawValue, setRawValue] = useState('true');
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' }>();

  const flags = useQuery({
    queryKey: [...adminApi.getAdminFeatureFlagsControllerListQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminFeatureFlagsControllerList(requestOptions)),
    retry: false,
  });

  const resetForm = () => {
    setEditingKey(undefined);
    setKey('');
    setDescription('');
    setEnabled(true);
    setValueType('boolean');
    setRawValue('true');
  };

  const mutation = useMutation({
    mutationFn: ({ flagKey, body }: { flagKey: string; body: adminApi.UpsertAdminFeatureFlagDto }) =>
      throwOnOpenApiErrorData(adminApi.adminFeatureFlagsControllerUpsert(flagKey, body, requestOptions)),
    onSuccess: async () => {
      setNotice({ message: t('admin.featureFlags.notice.saved'), tone: 'success' });
      resetForm();
      await queryClient.invalidateQueries({ queryKey: adminApi.getAdminFeatureFlagsControllerListQueryKey() });
    },
    onError: (error: unknown) => {
      setNotice({ message: errorText(error, 'admin.featureFlags.error.saveFailed', t), tone: 'warning' });
    },
  });

  const edit = (flag: FeatureFlag) => {
    const nextType = valueTypeFor(flag.value);
    setEditingKey(flag.key);
    setKey(flag.key);
    setDescription(flag.description);
    setEnabled(flag.enabled);
    setValueType(nextType);
    setRawValue(String(flag.value));
  };

  const save = () => {
    const normalizedKey = key.trim();
    if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/u.test(normalizedKey)) {
      setNotice({ message: t('admin.featureFlags.error.keyInvalid'), tone: 'warning' });
      return;
    }
    let value: boolean | number | string = rawValue;
    if (valueType === 'boolean') {
      value = rawValue === 'true';
    } else if (valueType === 'number') {
      value = Number(rawValue);
    }
    if (valueType === 'number' && !Number.isFinite(value)) {
      setNotice({ message: t('admin.featureFlags.error.numberInvalid'), tone: 'warning' });
      return;
    }
    mutation.mutate({
      flagKey: normalizedKey,
      body: { description: description.trim(), enabled, value },
    });
  };

  return (
    <UiSection
      className="admin-page"
      eyebrow={t('admin.featureFlags.eyebrow')}
      headingLevel={1}
      title={t('admin.featureFlags.title')}
    >
      <p>{t('admin.featureFlags.description')}</p>
      {notice ? <UiNotification message={notice.message} tone={notice.tone} /> : null}
      {access.canWriteFeatureFlags ? (
        <UiCard
          className="admin-form-card admin-feature-flag-form-card"
          title={editingKey ? t('admin.featureFlags.form.edit') : t('admin.featureFlags.form.create')}
        >
          <div className="admin-notification-form admin-feature-flag-form">
            <UiTextField
              disabled={Boolean(editingKey)}
              label={t('admin.featureFlags.field.key')}
              onChange={(event) => {
                setKey(event.currentTarget.value);
              }}
              placeholder="checkout.newflow"
              value={key}
            />
            <UiTextareaField
              label={t('admin.featureFlags.field.description')}
              onChange={(event) => {
                setDescription(event.currentTarget.value);
              }}
              rows={3}
              value={description}
            />
            <UiSelect
              label={t('admin.featureFlags.field.type')}
              onValueChange={(value) => {
                const next = value as ValueType;
                setValueType(next);
                setRawValue(next === 'boolean' ? 'true' : '');
              }}
              options={[
                { label: t('admin.featureFlags.type.boolean'), value: 'boolean' },
                { label: t('admin.featureFlags.type.number'), value: 'number' },
                { label: t('admin.featureFlags.type.string'), value: 'string' },
              ]}
              value={valueType}
            />
            {valueType === 'boolean' ? (
              <UiSelect
                label={t('admin.featureFlags.field.value')}
                onValueChange={setRawValue}
                options={[
                  { label: t('admin.featureFlags.boolean.true'), value: 'true' },
                  { label: t('admin.featureFlags.boolean.false'), value: 'false' },
                ]}
                value={rawValue}
              />
            ) : (
              <UiTextField
                label={t('admin.featureFlags.field.value')}
                onChange={(event) => {
                  setRawValue(event.currentTarget.value);
                }}
                type={valueType === 'number' ? 'number' : 'text'}
                value={rawValue}
              />
            )}
            <UiSwitch checked={enabled} label={t('admin.featureFlags.field.enabled')} onCheckedChange={setEnabled} />
            <div className="admin-table-toolbar">
              <UiButton disabled={mutation.isPending} onClick={save}>
                {t('admin.featureFlags.action.save')}
              </UiButton>
              {editingKey ? (
                <UiButton onClick={resetForm} variant="secondary">
                  {t('admin.featureFlags.action.cancel')}
                </UiButton>
              ) : null}
            </div>
          </div>
        </UiCard>
      ) : null}
      <UiCard className="admin-table-card admin-feature-flag-table-card" title={t('admin.featureFlags.title')}>
        <UiDataTable<FeatureFlag>
          aria-label={t('admin.featureFlags.title')}
          columns={[
            { header: t('admin.featureFlags.column.key'), id: 'key', render: (row) => <code>{row.key}</code> },
            {
              header: t('admin.featureFlags.column.value'),
              id: 'value',
              render: (row) => <code>{JSON.stringify(row.value)}</code>,
            },
            {
              header: t('admin.featureFlags.column.status'),
              id: 'status',
              render: (row) => (
                <UiStatusTag
                  label={t(row.enabled ? 'admin.featureFlags.status.enabled' : 'admin.featureFlags.status.disabled')}
                  tone={row.enabled ? 'success' : 'warning'}
                />
              ),
            },
            { header: t('admin.featureFlags.column.updated'), id: 'updated', render: (row) => row.updatedAt },
            ...(access.canWriteFeatureFlags
              ? [
                  {
                    header: t('admin.common.actions'),
                    id: 'actions',
                    render: (row: FeatureFlag) => (
                      <UiButton
                        onClick={() => {
                          edit(row);
                        }}
                        variant="secondary"
                      >
                        {t('admin.featureFlags.action.edit')}
                      </UiButton>
                    ),
                  },
                ]
              : []),
          ]}
          emptyDescription={t('admin.featureFlags.empty.description')}
          emptyTitle={t('admin.featureFlags.empty.title')}
          error={flags.error ? errorText(flags.error, 'admin.featureFlags.error.loadFailed', t) : undefined}
          isLoading={flags.isLoading}
          rowKey={(row) => row.id}
          rows={flags.data?.items ?? []}
        />
      </UiCard>
    </UiSection>
  );
};
