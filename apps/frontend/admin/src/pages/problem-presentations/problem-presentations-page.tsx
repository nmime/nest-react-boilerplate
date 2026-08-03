import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ProblemPresentationDisplays,
  ProblemPresentationSeverities,
  type ProblemPresentationDisplay,
  type ProblemPresentationSeverity,
} from '@app/common-problem-details';
import { apiToastRuntime, configureProblemPresentationOverrides } from '@app/frontend-api-support';
import { getLocalization, Language } from '@app/frontend-i18n-shared';
import {
  adminApi,
  apiToastRuleCatalog,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
  type ApiToastRuleCatalogItem,
} from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import {
  UiButton,
  UiCard,
  UiConfirmDialog,
  UiDataTable,
  UiInput,
  UiNotification,
  UiSection,
  UiSelect,
  UiStatCard,
  UiStatusTag,
  UiTextarea,
} from '@app/frontend-ui-web';
import type { AdminAccess } from '../../entities/admin-session';
import { errorText, formatDate } from '../../shared';

type OverrideRow = adminApi.AdminProblemPresentationViewDto;
type DisplayFilter = ProblemPresentationDisplay | 'all';

interface PresentationRow extends ApiToastRuleCatalogItem {
  readonly [key: string]: unknown;
  readonly catalogState: 'active' | 'deleted';
  readonly comment: string;
  readonly display: ProblemPresentationDisplay;
  readonly messageEn: string;
  readonly messageRu: string;
  readonly overridden: boolean;
  readonly revision: number;
  readonly severity: ProblemPresentationSeverity;
  readonly updatedAt?: string;
}

const statusTone = (severity: ProblemPresentationSeverity): 'info' | 'success' | 'warning' => {
  if (severity === 'success') {
    return 'success';
  }
  return severity === 'info' ? 'info' : 'warning';
};

const mergeCatalog = (overrides: readonly OverrideRow[]): PresentationRow[] => {
  const overridesByRuleId = new Map(overrides.map((override) => [override.ruleId, override]));
  const generatedRuleIds = new Set(apiToastRuleCatalog.map((rule) => rule.id));
  const active = apiToastRuleCatalog.map((rule) => {
    const override = overridesByRuleId.get(rule.id);
    return {
      ...rule,
      catalogState: 'active' as const,
      comment: override?.comment ?? '',
      display: override?.display ?? (rule.defaultDisplay as ProblemPresentationDisplay),
      messageEn: override?.messageEn ?? '',
      messageRu: override?.messageRu ?? '',
      overridden: Boolean(override),
      revision: override?.revision ?? 0,
      severity: override?.severity ?? rule.defaultSeverity,
      ...(override?.updatedAt ? { updatedAt: override.updatedAt } : {}),
    };
  });
  const deleted = overrides
    .filter((override) => !generatedRuleIds.has(override.ruleId))
    .map((override): PresentationRow => ({
      app: /^([^:]+)/u.exec(override.ruleId)?.[1] ?? '—',
      catalogState: 'deleted',
      comment: override.comment,
      defaultDisplay: 'silent',
      defaultMessage: '',
      defaultSeverity: 'error',
      display: override.display,
      errorCode: null,
      id: override.ruleId,
      messageEn: override.messageEn,
      messageRu: override.messageRu,
      method: '—',
      operationId: null,
      overridden: true,
      path: override.ruleId,
      revision: override.revision,
      severity: override.severity,
      status: 'DELETED',
      tags: [],
      ...(override.updatedAt ? { updatedAt: override.updatedAt } : {}),
    }));
  return [...active, ...deleted];
};

export const ProblemPresentationsPage = ({
  access,
  requestOptions,
}: Readonly<{
  access: AdminAccess;
  requestOptions?: ApiClientRequestOptions;
}>) => {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [appFilter, setAppFilter] = useState('all');
  const [displayFilter, setDisplayFilter] = useState<DisplayFilter>('all');
  const [editTarget, setEditTarget] = useState<PresentationRow>();
  const [resetTarget, setResetTarget] = useState<PresentationRow>();
  const [draftDisplay, setDraftDisplay] = useState<ProblemPresentationDisplay>('toast');
  const [draftSeverity, setDraftSeverity] = useState<ProblemPresentationSeverity>('error');
  const [draftMessageEn, setDraftMessageEn] = useState('');
  const [draftMessageRu, setDraftMessageRu] = useState('');
  const [draftComment, setDraftComment] = useState('');
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' }>();

  const presentations = useQuery({
    queryKey: [...adminApi.getAdminProblemPresentationsControllerListQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminProblemPresentationsControllerList(requestOptions)),
    retry: false,
  });
  // Memoised because `?? []` produces a fresh array on every render while the
  // query is loading, which would re-run the configure effect below each time.
  const overrides = useMemo(() => presentations.data?.items ?? [], [presentations.data]);
  useEffect(() => {
    if (presentations.data) {
      configureProblemPresentationOverrides(overrides);
    }
  }, [overrides, presentations.data]);

  const items = useMemo(() => mergeCatalog(overrides), [overrides]);
  const normalizedSearch = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      items.filter((item) => {
        const matchesApp = appFilter === 'all' || item.app === appFilter;
        const matchesDisplay = displayFilter === 'all' || item.display === displayFilter;
        const matchesSearch =
          !normalizedSearch ||
          [item.id, item.path, item.method, item.status.toString(), item.errorCode ?? '', ...item.tags].some((value) =>
            value.toLowerCase().includes(normalizedSearch),
          );
        return matchesApp && matchesDisplay && matchesSearch;
      }),
    [appFilter, displayFilter, items, normalizedSearch],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: adminApi.getAdminProblemPresentationsControllerListQueryKey(),
    });
  const updateMutation = useMutation({
    mutationFn: (body: adminApi.UpdateAdminProblemPresentationDto) =>
      throwOnOpenApiErrorData(adminApi.adminProblemPresentationsControllerUpdate(body, requestOptions)),
    onSuccess: async () => {
      setNotice({ message: t('admin.problemPresentations.notice.updated'), tone: 'success' });
      await invalidate();
    },
    onError: (error: unknown) => {
      setNotice({
        message: errorText(error, 'admin.problemPresentations.error.updateFailed', t),
        tone: 'warning',
      });
    },
  });
  const resetMutation = useMutation({
    mutationFn: ({ ruleId, expectedRevision }: { ruleId: string; expectedRevision: number }) =>
      throwOnOpenApiErrorData(
        adminApi.adminProblemPresentationsControllerReset({ ruleId, expectedRevision }, requestOptions),
      ),
    onSuccess: async () => {
      setNotice({ message: t('admin.problemPresentations.notice.reset'), tone: 'success' });
      await invalidate();
    },
    onError: (error: unknown) => {
      setNotice({
        message: errorText(error, 'admin.problemPresentations.error.resetFailed', t),
        tone: 'warning',
      });
    },
  });

  const openEditor = (row: PresentationRow) => {
    setEditTarget(row);
    setDraftDisplay(row.display);
    setDraftSeverity(row.severity);
    setDraftMessageEn(row.messageEn);
    setDraftMessageRu(row.messageRu);
    setDraftComment(row.comment);
  };
  const preview = (row: PresentationRow) => {
    if (row.display === 'silent') {
      setNotice({ message: t('admin.problemPresentations.preview.silent'), tone: 'warning' });
      return;
    }
    apiToastRuntime.show({
      category: row.severity,
      message:
        getLocalization(
          {
            [Language.En]: row.messageEn || undefined,
            [Language.Ru]: row.messageRu || undefined,
          },
          locale,
        ) ?? row.defaultMessage,
      title: `${row.method} ${row.path}`,
    });
  };

  const displayOptions = [
    { label: t('admin.problemPresentations.filter.all'), value: 'all' },
    ...ProblemPresentationDisplays.map((display) => ({
      label: t(`admin.problemPresentations.display.${display}`),
      value: display,
    })),
  ];
  const severityOptions = ProblemPresentationSeverities.map((severity) => ({
    label: t(`admin.problemPresentations.severity.${severity}`),
    value: severity,
  }));
  const appOptions = [
    { label: t('admin.problemPresentations.filter.allServices'), value: 'all' },
    ...[...new Set(items.map((item) => item.app))].map((app) => ({ label: app, value: app })),
  ];

  return (
    <UiSection
      className="admin-page admin-problem-presentations-page"
      eyebrow={t('admin.problemPresentations.eyebrow')}
      headingLevel={1}
      title={t('admin.problemPresentations.title')}
    >
      <p className="admin-page-description">{t('admin.problemPresentations.description')}</p>
      <div className="admin-stat-grid xr-stat-grid">
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.problemPresentations.summary.total')}
          value={`${items.length}`}
          detail={t('admin.problemPresentations.summary.responses')}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.problemPresentations.summary.toast')}
          value={`${items.filter((item) => item.display === 'toast').length}`}
          detail={t('admin.problemPresentations.display.toast')}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.problemPresentations.summary.silent')}
          value={`${items.filter((item) => item.display === 'silent').length}`}
          detail={t('admin.problemPresentations.display.silent')}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.problemPresentations.summary.overridden')}
          value={`${overrides.length}`}
          detail={t('admin.problemPresentations.source.override')}
        />
      </div>
      {notice ? <UiNotification message={notice.message} tone={notice.tone} /> : null}
      <UiCard className="admin-filter-card" title={t('admin.problemPresentations.title')}>
        <div className="admin-table-toolbar admin-table-toolbar--leading">
          <UiInput
            aria-label={t('admin.problemPresentations.searchLabel')}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
            }}
            placeholder={t('admin.problemPresentations.searchPlaceholder')}
            value={search}
          />
          <UiSelect
            label={t('admin.problemPresentations.filter.service')}
            onValueChange={setAppFilter}
            options={appOptions}
            value={appFilter}
          />
          <UiSelect
            label={t('admin.problemPresentations.filter.display')}
            onValueChange={(value) => {
              setDisplayFilter(value as DisplayFilter);
            }}
            options={displayOptions}
            value={displayFilter}
          />
        </div>
      </UiCard>
      <UiCard className="admin-table-card" title={t('admin.problemPresentations.title')}>
        <UiDataTable<PresentationRow>
          rows={rows}
          rowKey={(row) => row.id}
          isLoading={presentations.isLoading}
          loadingLabel={t('admin.problemPresentations.loading')}
          error={
            presentations.error
              ? errorText(presentations.error, 'admin.problemPresentations.error.requestFailed', t)
              : undefined
          }
          emptyTitle={t('admin.problemPresentations.emptyTitle')}
          emptyDescription={t('admin.problemPresentations.emptyDescription')}
          columns={[
            {
              id: 'endpoint',
              header: t('admin.problemPresentations.column.endpoint'),
              render: (row) => (
                <span className="admin-problem-cell">
                  <strong>{row.path}</strong>
                  <small>{`${row.app} · ${row.tags.join(', ') || row.operationId || '—'}`}</small>
                </span>
              ),
            },
            {
              id: 'response',
              header: t('admin.problemPresentations.column.response'),
              render: (row) => (
                <span className="admin-problem-presentation">
                  <span className="admin-chip">{`${row.method} ${row.status}`}</span>
                  <small>{row.errorCode ?? '—'}</small>
                </span>
              ),
            },
            {
              id: 'presentation',
              header: t('admin.problemPresentations.column.presentation'),
              render: (row) => (
                <span className="admin-problem-presentation">
                  <UiStatusTag
                    label={t(`admin.problemPresentations.display.${row.display}`)}
                    tone={row.display === 'silent' ? 'info' : statusTone(row.severity)}
                  />
                  <small>{t(`admin.problemPresentations.severity.${row.severity}`)}</small>
                </span>
              ),
            },
            {
              id: 'source',
              header: t('admin.problemPresentations.column.source'),
              render: (row) => {
                let sourceLabel = t('admin.problemPresentations.source.generated');
                if (row.catalogState === 'deleted') {
                  sourceLabel = t('admin.problemPresentations.source.deleted');
                } else if (row.overridden) {
                  sourceLabel = t('admin.problemPresentations.source.override');
                }
                return (
                  <span className="admin-problem-source">
                    <UiStatusTag
                      label={sourceLabel}
                      tone={row.catalogState === 'deleted' || row.overridden ? 'warning' : 'info'}
                    />
                    <small>{row.updatedAt ? formatDate(row.updatedAt) : row.id}</small>
                  </span>
                );
              },
            },
            {
              id: 'actions',
              header: t('admin.problemPresentations.column.actions'),
              align: 'right',
              render: (row) => (
                <span className="admin-row-actions">
                  <UiButton
                    onClick={() => {
                      preview(row);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    {t('admin.problemPresentations.action.preview')}
                  </UiButton>
                  {access.canUpdateSettings && row.catalogState === 'active' ? (
                    <UiButton
                      onClick={() => {
                        openEditor(row);
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      {t('admin.problemPresentations.action.edit')}
                    </UiButton>
                  ) : null}
                  {access.canUpdateSettings && row.overridden ? (
                    <UiButton
                      onClick={() => {
                        setResetTarget(row);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      {t('admin.problemPresentations.action.reset')}
                    </UiButton>
                  ) : null}
                </span>
              ),
            },
          ]}
        />
      </UiCard>
      {editTarget ? (
        <UiConfirmDialog
          open
          onOpenChange={() => {
            setEditTarget(undefined);
          }}
          title={t('admin.problemPresentations.dialog.title', { code: `${editTarget.method} ${editTarget.path}` })}
          description={t('admin.problemPresentations.dialog.description')}
          confirmLabel={t('admin.problemPresentations.dialog.save')}
          onConfirm={() => {
            updateMutation.mutate({
              comment: draftComment,
              display: draftDisplay,
              expectedRevision: editTarget.revision,
              messageEn: draftMessageEn,
              messageRu: draftMessageRu,
              ruleId: editTarget.id,
              severity: draftSeverity,
            });
            setEditTarget(undefined);
          }}
        >
          <div className="admin-problem-editor">
            <UiSelect
              label={t('admin.problemPresentations.dialog.display')}
              onValueChange={(value) => {
                setDraftDisplay(value as ProblemPresentationDisplay);
              }}
              options={displayOptions.filter((option) => option.value !== 'all')}
              value={draftDisplay}
            />
            <UiSelect
              label={t('admin.problemPresentations.dialog.severity')}
              onValueChange={(value) => {
                setDraftSeverity(value as ProblemPresentationSeverity);
              }}
              options={severityOptions}
              value={draftSeverity}
            />
            <UiTextarea
              aria-label={t('admin.problemPresentations.dialog.messageEn')}
              onChange={(event) => {
                setDraftMessageEn(event.currentTarget.value);
              }}
              placeholder={editTarget.defaultMessage}
              value={draftMessageEn}
            />
            <UiTextarea
              aria-label={t('admin.problemPresentations.dialog.messageRu')}
              onChange={(event) => {
                setDraftMessageRu(event.currentTarget.value);
              }}
              placeholder={t('admin.problemPresentations.dialog.messageRuPlaceholder')}
              value={draftMessageRu}
            />
            <UiTextarea
              aria-label={t('admin.problemPresentations.dialog.comment')}
              onChange={(event) => {
                setDraftComment(event.currentTarget.value);
              }}
              placeholder={t('admin.problemPresentations.dialog.commentPlaceholder')}
              value={draftComment}
            />
          </div>
        </UiConfirmDialog>
      ) : null}
      {resetTarget ? (
        <UiConfirmDialog
          open
          onOpenChange={() => {
            setResetTarget(undefined);
          }}
          title={t('admin.problemPresentations.dialog.resetTitle', {
            code: `${resetTarget.method} ${resetTarget.path}`,
          })}
          description={t('admin.problemPresentations.dialog.resetDescription')}
          confirmLabel={t('admin.problemPresentations.action.reset')}
          onConfirm={() => {
            resetMutation.mutate({ ruleId: resetTarget.id, expectedRevision: resetTarget.revision });
            setResetTarget(undefined);
          }}
        />
      ) : null}
    </UiSection>
  );
};
