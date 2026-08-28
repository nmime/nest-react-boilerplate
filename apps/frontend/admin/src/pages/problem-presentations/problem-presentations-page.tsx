/* eslint-disable sonarjs/cognitive-complexity, sonarjs/no-nested-functions -- The studio route intentionally coordinates its table, filters, dialogs, and mutations in one FSD page boundary. */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@app/frontend-api-support';
import type { ProblemPresentationDisplay } from '@app/common-problem-details';
import type { ApiClientRequestOptions } from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import {
  UiButton,
  UiCard,
  UiCheckbox,
  UiConfirmDialog,
  UiDialog,
  UiInput,
  UiNotification,
  UiSection,
  UiSelect,
  UiStatCard,
  UiStatusTag,
  UiTabs,
  UiTextField,
} from '@app/frontend-ui-web';
import type { AdminAccess } from '../../entities/admin-session';
import {
  apiResponseStudioApi,
  apiResponseStudioQueryKeys,
  emptyPresentation,
  PresentationEditor,
  type ApiResponseStudioHistoryQuery,
  type ApiResponseStudioPresentation,
  type ApiResponseStudioPresentationPatch,
  type ApiResponseStudioResponse,
  type ApiResponseStudioResponseQuery,
  type ApiResponseStudioSource,
  type CreateApiResponseStudioSource,
  type StudioChangeState,
  type StudioLanguage,
  toRevisionItem,
} from '../../features/api-response-studio';
import { errorText, formatDate } from '../../shared';

type Notice = { message: string; tone: 'success' | 'warning' };
type SourceDraft = CreateApiResponseStudioSource;

const newSource: SourceDraft = { docsUrl: '', enabled: true, jsonUrl: '', name: '', slug: '' };
const displayValues: ProblemPresentationDisplay[] = ['toast', 'modal', 'custom', 'silent'];
const changeValues: StudioChangeState[] = ['unchanged', 'new', 'modified', 'deleted'];
const languageValues: StudioLanguage[] = ['en', 'ru', 'zh'];
const presentationOf = (response: ApiResponseStudioResponse): ApiResponseStudioPresentation => ({
  comments: response.comments,
  customDescription: response.customDescription,
  display: response.display,
  figmaOnly: response.figmaOnly,
  severity: response.severity,
  support: response.support,
  texts: {
    en: [...response.texts.en],
    ru: [...response.texts.ru],
    zh: [...response.texts.zh],
  },
});

const groupResponses = (items: readonly ApiResponseStudioResponse[]) => {
  const groups = new Map<string, Map<string, ApiResponseStudioResponse[]>>();
  items.forEach((item) => {
    const tag = item.tag || 'Other';
    const paths = groups.get(tag) ?? new Map<string, ApiResponseStudioResponse[]>();
    const responses = paths.get(item.path) ?? [];
    responses.push(item);
    paths.set(item.path, responses);
    groups.set(tag, paths);
  });
  return [...groups].sort(([left], [right]) => left.localeCompare(right));
};

const percent = (translated: number, total: number): string => `${total ? Math.round((translated / total) * 100) : 0}%`;

const presentationPatch = (
  before: ApiResponseStudioPresentation,
  after: ApiResponseStudioPresentation,
): ApiResponseStudioPresentationPatch => {
  const patch: ApiResponseStudioPresentationPatch = {};
  if (before.display !== after.display) {
    patch.display = after.display;
  }
  if (before.severity !== after.severity) {
    patch.severity = after.severity;
  }
  if (before.support !== after.support) {
    patch.support = after.support;
  }
  if (before.customDescription !== after.customDescription) {
    patch.customDescription = after.customDescription;
  }
  if (before.figmaOnly !== after.figmaOnly) {
    patch.figmaOnly = after.figmaOnly;
  }
  if (before.comments !== after.comments) {
    patch.comments = after.comments;
  }
  if (JSON.stringify(before.texts) !== JSON.stringify(after.texts)) {
    patch.texts = after.texts;
  }
  return patch;
};

export const ProblemPresentationsPage = ({
  access,
  requestOptions,
}: Readonly<{
  access: AdminAccess;
  requestOptions?: ApiClientRequestOptions;
}>) => {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const canWrite = access.canUpdateSettings;
  const [query, setQuery] = useState<ApiResponseStudioResponseQuery>({ includeDeleted: true, limit: 100, offset: 0 });
  const [historyQuery, setHistoryQuery] = useState<ApiResponseStudioHistoryQuery>({ limit: 100, offset: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>();
  const [sourceTarget, setSourceTarget] = useState<ApiResponseStudioSource>();
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(newSource);
  const [sourceError, setSourceError] = useState('');
  const [editTarget, setEditTarget] = useState<ApiResponseStudioResponse>();
  const [resetTarget, setResetTarget] = useState<ApiResponseStudioResponse>();
  const [viewerTarget, setViewerTarget] = useState<ApiResponseStudioResponse>();
  const [editorDraft, setEditorDraft] = useState<ApiResponseStudioPresentation>(emptyPresentation);
  const [bulkDraft, setBulkDraft] = useState<ApiResponseStudioPresentation>(emptyPresentation);
  const [bulkBaseline, setBulkBaseline] = useState<ApiResponseStudioPresentation>(emptyPresentation);
  const [bulkOpen, setBulkOpen] = useState(false);

  const dashboard = useQuery({
    queryFn: () => apiResponseStudioApi.dashboard(requestOptions),
    queryKey: apiResponseStudioQueryKeys.dashboard,
    retry: false,
  });
  const sources = useQuery({
    queryFn: () => apiResponseStudioApi.listSources(requestOptions),
    queryKey: apiResponseStudioQueryKeys.sources,
    retry: false,
  });
  const responses = useQuery({
    queryFn: () => apiResponseStudioApi.listResponses(query, requestOptions),
    queryKey: apiResponseStudioQueryKeys.responses(query),
    retry: false,
  });
  const history = useQuery({
    queryFn: () => apiResponseStudioApi.history(historyQuery, requestOptions),
    queryKey: apiResponseStudioQueryKeys.history(historyQuery),
    retry: false,
  });

  const rows = useMemo(() => responses.data?.items ?? [], [responses.data]);
  const groups = useMemo(() => groupResponses(rows), [rows]);
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);
  const coverage = useMemo(
    () =>
      Object.fromEntries(
        languageValues.map((language) => [language, rows.filter((row) => row.texts[language].length > 0).length]),
      ) as Record<StudioLanguage, number>,
    [rows],
  );
  const total = responses.data?.total ?? rows.length;
  const changed = rows.filter((row) => row.changeState !== 'unchanged' && !row.changeDismissed).length;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: apiResponseStudioQueryKeys.all });
  };
  const mutationError = (error: unknown, fallback: Parameters<typeof errorText>[1]) => {
    setNotice({
      message:
        error instanceof ApiError && error.status === 409
          ? t('admin.apiResponseStudio.error.conflict')
          : errorText(error, fallback, t),
      tone: 'warning',
    });
  };
  const success = async (message: string) => {
    setNotice({ message, tone: 'success' });
    setSelected(new Set());
    await invalidate();
  };

  const sourceMutation = useMutation({
    mutationFn: ({ source, draft }: { source?: ApiResponseStudioSource; draft: SourceDraft }) =>
      source
        ? apiResponseStudioApi.updateSource(source, draft, requestOptions)
        : apiResponseStudioApi.createSource(draft, requestOptions),
    onError: (error) => {
      mutationError(error, 'admin.apiResponseStudio.error.source');
    },
    onSuccess: async () => {
      setSourceTarget(undefined);
      setSourceDraft(newSource);
      await success(t('admin.apiResponseStudio.notice.sourceSaved'));
    },
  });
  const syncMutation = useMutation({
    mutationFn: (source: ApiResponseStudioSource) => apiResponseStudioApi.syncSource(source, requestOptions),
    onError: (error) => {
      mutationError(error, 'admin.apiResponseStudio.error.sync');
    },
    onSuccess: () => success(t('admin.apiResponseStudio.notice.synced')),
  });
  const responseMutation = useMutation({
    mutationFn: ({
      response,
      presentation,
    }: {
      response: ApiResponseStudioResponse;
      presentation: ApiResponseStudioPresentation;
    }) => apiResponseStudioApi.updateResponse(response, presentation, requestOptions),
    onError: (error) => {
      mutationError(error, 'admin.apiResponseStudio.error.update');
    },
    onSuccess: async () => {
      setEditTarget(undefined);
      await success(t('admin.apiResponseStudio.notice.updated'));
    },
  });
  const bulkMutation = useMutation({
    mutationFn: ({
      responses: selectedResponses,
      patch,
    }: {
      responses: ApiResponseStudioResponse[];
      patch: ApiResponseStudioPresentationPatch;
    }) => apiResponseStudioApi.bulkUpdate(selectedResponses.map(toRevisionItem), patch, requestOptions),
    onError: (error) => {
      mutationError(error, 'admin.apiResponseStudio.error.bulk');
    },
    onSuccess: async () => {
      setBulkOpen(false);
      await success(t('admin.apiResponseStudio.notice.bulkUpdated'));
    },
  });
  const dismissMutation = useMutation({
    mutationFn: () => apiResponseStudioApi.dismiss(selectedRows.map(toRevisionItem), requestOptions),
    onError: (error) => {
      mutationError(error, 'admin.apiResponseStudio.error.dismiss');
    },
    onSuccess: () => success(t('admin.apiResponseStudio.notice.dismissed')),
  });
  const resetMutation = useMutation({
    mutationFn: (response: ApiResponseStudioResponse) =>
      apiResponseStudioApi.reset(response.id, response.revision, requestOptions),
    onError: (error) => {
      mutationError(error, 'admin.apiResponseStudio.error.reset');
    },
    onSuccess: async () => {
      setResetTarget(undefined);
      await success(t('admin.apiResponseStudio.notice.reset'));
    },
  });
  const disableSourceMutation = useMutation({
    mutationFn: (source: ApiResponseStudioSource) =>
      apiResponseStudioApi.updateSource(
        source,
        {
          docsUrl: source.docsUrl,
          enabled: false,
          jsonUrl: source.jsonUrl,
          name: source.name,
          slug: source.slug,
        },
        requestOptions,
      ),
    onError: (error) => {
      mutationError(error, 'admin.apiResponseStudio.error.source');
    },
    onSuccess: () => success(t('admin.apiResponseStudio.notice.sourceDisabled')),
  });

  const toggleMany = (ids: readonly string[], checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  };
  const openSource = (source?: ApiResponseStudioSource) => {
    setSourceTarget(source);
    setSourceError('');
    setSourceDraft(
      source
        ? {
            docsUrl: source.docsUrl,
            enabled: source.enabled,
            jsonUrl: source.jsonUrl,
            name: source.name,
            slug: source.slug,
          }
        : { ...newSource },
    );
  };
  const saveSource = () => {
    if (!sourceDraft.name.trim() || !/^[a-z][a-z0-9-]{0,99}$/u.test(sourceDraft.slug)) {
      setSourceError(t('admin.apiResponseStudio.validation.source'));
      return;
    }
    try {
      const url = new URL(sourceDraft.jsonUrl);
      if (url.protocol !== 'https:') {
        throw new Error('https');
      }
    } catch {
      setSourceError(t('admin.apiResponseStudio.validation.https'));
      return;
    }
    sourceMutation.mutate({ source: sourceTarget, draft: sourceDraft });
  };
  const exportInventory = async () => {
    try {
      const exported = await apiResponseStudioApi.export(query, requestOptions);
      const blob = new Blob([exported.content], { type: exported.mediaType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exported.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice({ message: t('admin.apiResponseStudio.notice.exported'), tone: 'success' });
    } catch (error) {
      mutationError(error, 'admin.apiResponseStudio.error.export');
    }
  };

  const filterPanel = (
    <UiCard className="admin-filter-card admin-studio-filters" title={t('admin.apiResponseStudio.inventory.filters')}>
      <div className="admin-studio-filter-grid">
        <UiInput
          aria-label={t('admin.apiResponseStudio.filter.search')}
          onChange={(event) => {
            setQuery((current) => ({ ...current, search: event.currentTarget.value || undefined }));
          }}
          placeholder={t('admin.apiResponseStudio.filter.searchPlaceholder')}
          value={query.search ?? ''}
        />
        <UiSelect
          label={t('admin.apiResponseStudio.filter.source')}
          onValueChange={(sourceId) => {
            setQuery((current) => ({ ...current, sourceId: sourceId || undefined }));
          }}
          options={[
            { label: t('admin.apiResponseStudio.filter.all'), value: '' },
            ...(sources.data?.items ?? []).map((source) => ({ label: source.name, value: source.id })),
          ]}
          value={query.sourceId ?? ''}
        />
        <UiSelect
          label={t('admin.apiResponseStudio.filter.display')}
          onValueChange={(display) => {
            setQuery((current) => ({
              ...current,
              display: (display || undefined) as ProblemPresentationDisplay | undefined,
            }));
          }}
          options={[
            { label: t('admin.apiResponseStudio.filter.all'), value: '' },
            ...displayValues.map((display) => ({
              label: t(`admin.apiResponseStudio.display.${display}`),
              value: display,
            })),
          ]}
          value={query.display ?? ''}
        />
        <UiSelect
          label={t('admin.apiResponseStudio.filter.change')}
          onValueChange={(changeState) => {
            setQuery((current) => ({
              ...current,
              changeState: (changeState || undefined) as StudioChangeState | undefined,
            }));
          }}
          options={[
            { label: t('admin.apiResponseStudio.filter.all'), value: '' },
            ...changeValues.map((change) => ({ label: t(`admin.apiResponseStudio.change.${change}`), value: change })),
          ]}
          value={query.changeState ?? ''}
        />
        <UiSelect
          label={t('admin.apiResponseStudio.filter.missingLanguage')}
          onValueChange={(missingLanguage) => {
            setQuery((current) => ({
              ...current,
              missingLanguage: (missingLanguage || undefined) as StudioLanguage | undefined,
            }));
          }}
          options={[
            { label: t('admin.apiResponseStudio.filter.all'), value: '' },
            ...languageValues.map((language) => ({ label: language.toUpperCase(), value: language })),
          ]}
          value={query.missingLanguage ?? ''}
        />
      </div>
    </UiCard>
  );

  const inventory = (
    <div className="admin-studio-tab">
      {filterPanel}
      <UiCard className="admin-table-card admin-studio-inventory" title={t('admin.apiResponseStudio.inventory.title')}>
        <div className="admin-studio-bulkbar">
          <UiCheckbox
            checked={rows.length > 0 && rows.every((row) => selected.has(row.id))}
            label={t('admin.apiResponseStudio.selection.all')}
            onCheckedChange={(checked) => {
              toggleMany(
                rows.map((row) => row.id),
                checked === true,
              );
            }}
          />
          <span aria-live="polite">{t('admin.apiResponseStudio.selection.count', { count: selected.size })}</span>
          <div className="admin-row-actions">
            {canWrite ? (
              <>
                <UiButton
                  disabled={selectedRows.length === 0}
                  onClick={() => {
                    const baseline = selectedRows[0] ? presentationOf(selectedRows[0]) : emptyPresentation;
                    setBulkBaseline(baseline);
                    setBulkDraft(baseline);
                    setBulkOpen(true);
                  }}
                  size="sm"
                >
                  {t('admin.apiResponseStudio.action.bulkEdit')}
                </UiButton>
                <UiButton
                  disabled={selectedRows.length === 0}
                  onClick={() => {
                    dismissMutation.mutate();
                  }}
                  size="sm"
                  variant="secondary"
                >
                  {t('admin.apiResponseStudio.action.dismiss')}
                </UiButton>
              </>
            ) : null}
            <UiButton onClick={() => void exportInventory()} size="sm" variant="secondary">
              {t('admin.apiResponseStudio.action.export')}
            </UiButton>
          </div>
        </div>
        {responses.isLoading ? <p role="status">{t('admin.apiResponseStudio.loading.inventory')}</p> : null}
        {responses.error ? (
          <UiNotification
            message={errorText(responses.error, 'admin.apiResponseStudio.error.inventory', t)}
            tone="warning"
          />
        ) : null}
        {!responses.isLoading && !responses.error && rows.length === 0 ? (
          <div className="admin-studio-empty">
            <strong>{t('admin.apiResponseStudio.empty.title')}</strong>
            <p>{t('admin.apiResponseStudio.empty.description')}</p>
          </div>
        ) : null}
        <div className="admin-studio-pagination" aria-label={t('admin.apiResponseStudio.inventory.pagination')}>
          <UiButton
            disabled={(query.offset ?? 0) === 0}
            onClick={() => {
              setQuery((current) => ({ ...current, offset: Math.max(0, (current.offset ?? 0) - 100) }));
            }}
            size="sm"
            variant="secondary"
          >
            {t('admin.apiResponseStudio.action.previous')}
          </UiButton>
          <span>{`${(query.offset ?? 0) + (rows.length ? 1 : 0)}–${(query.offset ?? 0) + rows.length} / ${total}`}</span>
          <UiButton
            disabled={(query.offset ?? 0) + rows.length >= total}
            onClick={() => {
              setQuery((current) => ({ ...current, offset: (current.offset ?? 0) + 100 }));
            }}
            size="sm"
            variant="secondary"
          >
            {t('admin.apiResponseStudio.action.next')}
          </UiButton>
        </div>
        <div className="admin-studio-groups">
          {groups.map(([tag, paths]) => {
            const groupRows = [...paths.values()].flat();
            return (
              <section className="admin-studio-group" key={tag}>
                <header>
                  <UiCheckbox
                    checked={groupRows.every((row) => selected.has(row.id))}
                    label={t('admin.apiResponseStudio.selection.group', { name: tag })}
                    onCheckedChange={(checked) => {
                      toggleMany(
                        groupRows.map((row) => row.id),
                        checked === true,
                      );
                    }}
                  />
                  <UiStatusTag label={`${groupRows.length}`} tone="neutral" />
                </header>
                {[...paths].map(([path, pathRows]) => (
                  <div className="admin-studio-path" key={path}>
                    <div className="admin-studio-path__header">
                      <UiCheckbox
                        checked={pathRows.every((row) => selected.has(row.id))}
                        label={t('admin.apiResponseStudio.selection.path', { path })}
                        onCheckedChange={(checked) => {
                          toggleMany(
                            pathRows.map((row) => row.id),
                            checked === true,
                          );
                        }}
                      />
                      <code>{path}</code>
                    </div>
                    <div className="admin-studio-response-list">
                      {pathRows.map((row) => (
                        <article className="admin-studio-response" data-deleted={row.deleted} key={row.id}>
                          <UiCheckbox
                            checked={selected.has(row.id)}
                            label={t('admin.apiResponseStudio.selection.row', {
                              method: row.method,
                              status: row.status,
                            })}
                            labelHidden
                            onCheckedChange={(checked) => {
                              toggleMany([row.id], checked === true);
                            }}
                          />
                          <div className="admin-studio-response__identity">
                            <strong>{`${row.method} ${row.status}`}</strong>
                            <small>{row.summary || row.errorType || row.operationId || row.stableKey}</small>
                          </div>
                          <div className="admin-studio-response__status">
                            <UiStatusTag label={t(`admin.apiResponseStudio.display.${row.display}`)} tone="info" />
                            <UiStatusTag
                              label={t(`admin.apiResponseStudio.change.${row.changeState}`)}
                              tone={row.changeState === 'unchanged' ? 'neutral' : 'warning'}
                            />
                          </div>
                          <div
                            className="admin-studio-language-badges"
                            aria-label={t('admin.apiResponseStudio.coverage.label')}
                          >
                            {languageValues.map((language) => (
                              <span data-complete={row.texts[language].length > 0} key={language}>
                                {language.toUpperCase()}
                              </span>
                            ))}
                          </div>
                          <div className="admin-row-actions">
                            <UiButton
                              onClick={() => {
                                setViewerTarget(row);
                              }}
                              size="sm"
                              variant="ghost"
                            >
                              {t('admin.apiResponseStudio.action.inspect')}
                            </UiButton>
                            {canWrite ? (
                              <>
                                <UiButton
                                  onClick={() => {
                                    setEditTarget(row);
                                    setEditorDraft(presentationOf(row));
                                  }}
                                  size="sm"
                                  variant="secondary"
                                >
                                  {t('admin.apiResponseStudio.action.edit')}
                                </UiButton>
                                <UiButton
                                  onClick={() => {
                                    setResetTarget(row);
                                  }}
                                  size="sm"
                                  variant="ghost"
                                >
                                  {t('admin.apiResponseStudio.action.reset')}
                                </UiButton>
                              </>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </UiCard>
    </div>
  );

  const sourcePanel = (
    <div className="admin-studio-tab">
      <div className="admin-studio-panel-heading">
        <p>{t('admin.apiResponseStudio.sources.description')}</p>
        {canWrite ? (
          <UiButton
            onClick={() => {
              openSource();
            }}
          >
            {t('admin.apiResponseStudio.action.addSource')}
          </UiButton>
        ) : null}
      </div>
      {sources.isLoading ? <p role="status">{t('admin.apiResponseStudio.loading.sources')}</p> : null}
      {sources.error ? (
        <UiNotification message={errorText(sources.error, 'admin.apiResponseStudio.error.sources', t)} tone="warning" />
      ) : null}
      <div className="admin-studio-source-grid">
        {(sources.data?.items ?? []).map((source) => (
          <UiCard key={source.id} title={source.name}>
            <dl className="admin-studio-source-details">
              <div>
                <dt>{t('admin.apiResponseStudio.source.url')}</dt>
                <dd>
                  <a href={source.jsonUrl} rel="noopener noreferrer" target="_blank">
                    {source.jsonUrl}
                  </a>
                </dd>
              </div>
              <div>
                <dt>{t('admin.apiResponseStudio.source.status')}</dt>
                <dd>{source.lastSyncStatus || '—'}</dd>
              </div>
              <div>
                <dt>{t('admin.apiResponseStudio.source.lastSync')}</dt>
                <dd>{formatDate(source.lastSyncAt ?? undefined)}</dd>
              </div>
            </dl>
            {source.lastSyncError ? <UiNotification message={source.lastSyncError} tone="warning" /> : null}
            <div className="admin-row-actions">
              {source.docsUrl ? (
                <UiButton href={source.docsUrl} rel="noopener noreferrer" size="sm" target="_blank" variant="ghost">
                  {t('admin.apiResponseStudio.action.docs')}
                </UiButton>
              ) : null}
              {canWrite ? (
                <>
                  <UiButton
                    onClick={() => {
                      openSource(source);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    {t('admin.apiResponseStudio.action.edit')}
                  </UiButton>
                  <UiButton
                    disabled={syncMutation.isPending}
                    onClick={() => {
                      syncMutation.mutate(source);
                    }}
                    size="sm"
                  >
                    {t('admin.apiResponseStudio.action.sync')}
                  </UiButton>
                  {source.enabled ? (
                    <UiButton
                      onClick={() => {
                        disableSourceMutation.mutate(source);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      {t('admin.apiResponseStudio.action.disable')}
                    </UiButton>
                  ) : null}
                </>
              ) : null}
            </div>
          </UiCard>
        ))}
      </div>
      {!sources.isLoading && !sources.error && (sources.data?.items.length ?? 0) === 0 ? (
        <div className="admin-studio-empty">
          <strong>{t('admin.apiResponseStudio.sources.empty')}</strong>
        </div>
      ) : null}
    </div>
  );

  const historyPanel = (
    <div className="admin-studio-tab">
      {history.isLoading ? <p role="status">{t('admin.apiResponseStudio.loading.history')}</p> : null}
      {history.error ? (
        <UiNotification message={errorText(history.error, 'admin.apiResponseStudio.error.history', t)} tone="warning" />
      ) : null}
      <ol className="admin-studio-history">
        {(history.data?.items ?? []).map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>{entry.action}</strong>
              <small>{entry.actorUserId}</small>
            </div>
            <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
            <details>
              <summary>{t('admin.apiResponseStudio.history.details')}</summary>
              <pre>
                {JSON.stringify({ before: entry.before, after: entry.after, metadata: entry.metadata }, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ol>
      <div className="admin-studio-pagination" aria-label={t('admin.apiResponseStudio.history.pagination')}>
        <UiButton
          disabled={(historyQuery.offset ?? 0) === 0}
          onClick={() => {
            setHistoryQuery((current) => ({ ...current, offset: Math.max(0, (current.offset ?? 0) - 100) }));
          }}
          size="sm"
          variant="secondary"
        >
          {t('admin.apiResponseStudio.action.previous')}
        </UiButton>
        <span>{`${(historyQuery.offset ?? 0) + ((history.data?.items.length ?? 0) ? 1 : 0)}–${(historyQuery.offset ?? 0) + (history.data?.items.length ?? 0)}`}</span>
        <UiButton
          disabled={(history.data?.items.length ?? 0) < 100}
          onClick={() => {
            setHistoryQuery((current) => ({ ...current, offset: (current.offset ?? 0) + 100 }));
          }}
          size="sm"
          variant="secondary"
        >
          {t('admin.apiResponseStudio.action.next')}
        </UiButton>
      </div>
      {!history.isLoading && !history.error && (history.data?.items.length ?? 0) === 0 ? (
        <div className="admin-studio-empty">
          <strong>{t('admin.apiResponseStudio.history.empty')}</strong>
        </div>
      ) : null}
    </div>
  );

  return (
    <UiSection
      className="admin-page admin-api-response-studio-page"
      eyebrow={t('admin.apiResponseStudio.eyebrow')}
      headingLevel={1}
      title={t('admin.apiResponseStudio.title')}
    >
      <div className="admin-studio-intro">
        <p className="admin-page-description">{t('admin.apiResponseStudio.description')}</p>
        {!canWrite ? <UiStatusTag label={t('admin.apiResponseStudio.readOnly')} tone="info" /> : null}
      </div>
      {notice ? <UiNotification message={notice.message} tone={notice.tone} /> : null}
      {dashboard.error ? (
        <UiNotification
          message={errorText(dashboard.error, 'admin.apiResponseStudio.error.dashboard', t)}
          tone="warning"
        />
      ) : null}
      <div className="admin-stat-grid xr-stat-grid admin-studio-stats" aria-busy={dashboard.isLoading}>
        <UiStatCard
          className="admin-stat-card"
          detail={t('admin.apiResponseStudio.stats.responsesDetail')}
          label={t('admin.apiResponseStudio.stats.responses')}
          value={`${total}`}
        />
        <UiStatCard
          className="admin-stat-card"
          detail={t('admin.apiResponseStudio.stats.sourcesDetail')}
          label={t('admin.apiResponseStudio.stats.sources')}
          value={`${sources.data?.items.length ?? dashboard.data?.sources.length ?? 0}`}
        />
        <UiStatCard
          className="admin-stat-card"
          detail={t('admin.apiResponseStudio.stats.changesDetail')}
          label={t('admin.apiResponseStudio.stats.changes')}
          value={`${changed}`}
        />
        {languageValues.map((language) => (
          <UiStatCard
            className="admin-stat-card"
            detail={`${coverage[language]} / ${rows.length}`}
            key={language}
            label={t('admin.apiResponseStudio.stats.coverage', { language: language.toUpperCase() })}
            value={percent(coverage[language], rows.length)}
          />
        ))}
      </div>
      <UiTabs
        label={t('admin.apiResponseStudio.tabs.label')}
        items={[
          { content: inventory, label: t('admin.apiResponseStudio.tabs.inventory'), value: 'inventory' },
          { content: sourcePanel, label: t('admin.apiResponseStudio.tabs.sources'), value: 'sources' },
          { content: historyPanel, label: t('admin.apiResponseStudio.tabs.history'), value: 'history' },
        ]}
      />
      {sourceTarget || sourceDraft !== newSource ? (
        <UiConfirmDialog
          cancelLabel={t('admin.apiResponseStudio.action.cancel')}
          confirmLabel={t('admin.apiResponseStudio.action.saveSource')}
          description={t('admin.apiResponseStudio.source.dialogDescription')}
          onConfirm={saveSource}
          onOpenChange={(open) => {
            if (!open) {
              setSourceTarget(undefined);
              setSourceDraft({ ...newSource });
            }
          }}
          open
          title={
            sourceTarget
              ? t('admin.apiResponseStudio.source.editTitle')
              : t('admin.apiResponseStudio.source.createTitle')
          }
        >
          <div className="admin-studio-editor">
            {sourceError ? <UiNotification message={sourceError} tone="warning" /> : null}
            <UiTextField
              label={t('admin.apiResponseStudio.source.name')}
              onChange={(event) => {
                const name = event.currentTarget.value;
                setSourceDraft((current) => ({ ...current, name }));
              }}
              value={sourceDraft.name}
            />
            <UiTextField
              label={t('admin.apiResponseStudio.source.slug')}
              onChange={(event) => {
                const slug = event.currentTarget.value;
                setSourceDraft((current) => ({ ...current, slug }));
              }}
              value={sourceDraft.slug}
            />
            <UiTextField
              label={t('admin.apiResponseStudio.source.jsonUrl')}
              onChange={(event) => {
                const jsonUrl = event.currentTarget.value;
                setSourceDraft((current) => ({ ...current, jsonUrl }));
              }}
              type="url"
              value={sourceDraft.jsonUrl}
            />
            <UiTextField
              label={t('admin.apiResponseStudio.source.docsUrl')}
              onChange={(event) => {
                const docsUrl = event.currentTarget.value;
                setSourceDraft((current) => ({ ...current, docsUrl }));
              }}
              type="url"
              value={sourceDraft.docsUrl}
            />
            <UiCheckbox
              checked={sourceDraft.enabled}
              label={t('admin.apiResponseStudio.source.enabled')}
              onCheckedChange={(checked) => {
                setSourceDraft((current) => ({ ...current, enabled: checked === true }));
              }}
            />
          </div>
        </UiConfirmDialog>
      ) : null}
      {editTarget ? (
        <UiConfirmDialog
          cancelLabel={t('admin.apiResponseStudio.action.cancel')}
          confirmLabel={t('admin.apiResponseStudio.action.save')}
          description={t('admin.apiResponseStudio.editor.description')}
          onConfirm={() => {
            responseMutation.mutate({ response: editTarget, presentation: editorDraft });
          }}
          onOpenChange={(open) => {
            if (!open) {
              setEditTarget(undefined);
            }
          }}
          open
          title={t('admin.apiResponseStudio.editor.title', {
            method: editTarget.method,
            path: editTarget.path,
            status: editTarget.status,
          })}
        >
          <PresentationEditor key={editTarget.id} initial={editorDraft} onChange={setEditorDraft} />
        </UiConfirmDialog>
      ) : null}
      {bulkOpen ? (
        <UiConfirmDialog
          cancelLabel={t('admin.apiResponseStudio.action.cancel')}
          confirmLabel={t('admin.apiResponseStudio.action.applyBulk')}
          description={t('admin.apiResponseStudio.bulk.description', { count: selectedRows.length })}
          onConfirm={() => {
            const patch = presentationPatch(bulkBaseline, bulkDraft);
            if (Object.keys(patch).length === 0) {
              return;
            }
            bulkMutation.mutate({ responses: selectedRows, patch });
          }}
          onOpenChange={setBulkOpen}
          open
          title={t('admin.apiResponseStudio.bulk.title')}
        >
          <PresentationEditor
            key={selectedRows.map((row) => row.id).join(':') || 'bulk-editor'}
            initial={bulkDraft}
            onChange={setBulkDraft}
          />
        </UiConfirmDialog>
      ) : null}
      {resetTarget ? (
        <UiConfirmDialog
          cancelLabel={t('admin.apiResponseStudio.action.cancel')}
          confirmLabel={t('admin.apiResponseStudio.action.reset')}
          description={t('admin.apiResponseStudio.reset.description')}
          onConfirm={() => {
            resetMutation.mutate(resetTarget);
          }}
          onOpenChange={(open) => {
            if (!open) {
              setResetTarget(undefined);
            }
          }}
          open
          title={t('admin.apiResponseStudio.reset.title')}
        />
      ) : null}
      {viewerTarget ? (
        <UiDialog
          description={t('admin.apiResponseStudio.viewer.description')}
          onOpenChange={(open) => {
            if (!open) {
              setViewerTarget(undefined);
            }
          }}
          open
          title={`${viewerTarget.method} ${viewerTarget.path} · ${viewerTarget.status}`}
        >
          <div className="admin-studio-viewer">
            <section>
              <h3>{t('admin.apiResponseStudio.viewer.schema')}</h3>
              <pre>{viewerTarget.schemaSnapshot || t('admin.apiResponseStudio.viewer.none')}</pre>
            </section>
            <section>
              <h3>{t('admin.apiResponseStudio.viewer.example')}</h3>
              <pre>{viewerTarget.exampleSnapshot || t('admin.apiResponseStudio.viewer.none')}</pre>
            </section>
            {viewerTarget.enumChoices.length ? (
              <section>
                <h3>{t('admin.apiResponseStudio.viewer.enums')}</h3>
                <pre>{JSON.stringify(viewerTarget.enumChoices, null, 2)}</pre>
              </section>
            ) : null}
          </div>
        </UiDialog>
      ) : null}
    </UiSection>
  );
};
