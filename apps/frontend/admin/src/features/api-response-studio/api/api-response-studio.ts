import { generatedAdminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import type {
  ApiResponseStudioDashboard,
  ApiResponseStudioExport,
  ApiResponseStudioHistoryEntry,
  ApiResponseStudioHistoryQuery,
  ApiResponseStudioPresentation,
  ApiResponseStudioPresentationPatch,
  ApiResponseStudioResponse,
  ApiResponseStudioResponseQuery,
  ApiResponseStudioSource,
  CreateApiResponseStudioSource,
  RevisionItem,
  UpdateApiResponseStudioSource,
} from '../model/types';

const data = async <T>(request: Promise<unknown>): Promise<T> => (await throwOnOpenApiErrorData(request as never)) as T;

export const apiResponseStudioApi = {
  bulkUpdate: (
    items: readonly RevisionItem[],
    patch: ApiResponseStudioPresentationPatch,
    requestOptions?: ApiClientRequestOptions,
  ) => {
    const body: generatedAdminApi.BulkApiResponseStudioResponsesDto = { items: [...items], patch };
    return data<{ items: ApiResponseStudioResponse[] }>(
      generatedAdminApi.adminApiResponseStudioControllerBulk(body, requestOptions),
    );
  },
  createSource: (input: CreateApiResponseStudioSource, requestOptions?: ApiClientRequestOptions) =>
    data<ApiResponseStudioSource>(
      generatedAdminApi.adminApiResponseStudioControllerCreateSource(input, requestOptions),
    ),
  dashboard: (requestOptions?: ApiClientRequestOptions) =>
    data<ApiResponseStudioDashboard>(generatedAdminApi.adminApiResponseStudioControllerDashboard(requestOptions)),
  dismiss: (items: readonly RevisionItem[], requestOptions?: ApiClientRequestOptions) =>
    data<{ items: ApiResponseStudioResponse[] }>(
      generatedAdminApi.adminApiResponseStudioControllerDismiss({ items: [...items] }, requestOptions),
    ),
  export: (query: ApiResponseStudioResponseQuery, requestOptions?: ApiClientRequestOptions) =>
    data<ApiResponseStudioExport>(generatedAdminApi.adminApiResponseStudioControllerExport(query, requestOptions)),
  history: (query: ApiResponseStudioHistoryQuery = {}, requestOptions?: ApiClientRequestOptions) =>
    data<{ items: ApiResponseStudioHistoryEntry[] }>(
      generatedAdminApi.adminApiResponseStudioControllerHistory(query, requestOptions),
    ),
  listResponses: (query: ApiResponseStudioResponseQuery, requestOptions?: ApiClientRequestOptions) =>
    data<{ items: ApiResponseStudioResponse[]; total: number }>(
      generatedAdminApi.adminApiResponseStudioControllerResponses(query, requestOptions),
    ),
  listSources: (requestOptions?: ApiClientRequestOptions) =>
    data<{ items: ApiResponseStudioSource[] }>(
      generatedAdminApi.adminApiResponseStudioControllerSources(requestOptions),
    ),
  reset: (id: string, expectedRevision: number, requestOptions?: ApiClientRequestOptions) =>
    data<ApiResponseStudioResponse>(
      generatedAdminApi.adminApiResponseStudioControllerResetResponse(id, { expectedRevision }, requestOptions),
    ),
  syncSource: (source: ApiResponseStudioSource, requestOptions?: ApiClientRequestOptions) =>
    data<{ source: ApiResponseStudioSource; summary: Record<string, number> }>(
      generatedAdminApi.adminApiResponseStudioControllerSync(
        source.id,
        { expectedRevision: source.revision },
        requestOptions,
      ),
    ),
  updateResponse: (
    response: ApiResponseStudioResponse,
    presentation: ApiResponseStudioPresentation,
    enumChoices: ApiResponseStudioResponse['enumChoices'],
    requestOptions?: ApiClientRequestOptions,
  ) => {
    const body: generatedAdminApi.UpdateApiResponseStudioResponseDto = {
      ...presentation,
      enumChoices,
      expectedRevision: response.revision,
    };
    return data<ApiResponseStudioResponse>(
      generatedAdminApi.adminApiResponseStudioControllerUpdateResponse(response.id, body, requestOptions),
    );
  },
  updateSource: (
    source: ApiResponseStudioSource,
    input: UpdateApiResponseStudioSource,
    requestOptions?: ApiClientRequestOptions,
  ) =>
    data<ApiResponseStudioSource>(
      generatedAdminApi.adminApiResponseStudioControllerUpdateSource(
        source.id,
        { ...input, expectedRevision: source.revision },
        requestOptions,
      ),
    ),
};

export const apiResponseStudioQueryKeys = {
  all: ['admin', 'api-response-studio'] as const,
  dashboard: ['admin', 'api-response-studio', 'dashboard'] as const,
  history: (query: ApiResponseStudioHistoryQuery) => ['admin', 'api-response-studio', 'history', query] as const,
  responses: (query: ApiResponseStudioResponseQuery) => ['admin', 'api-response-studio', 'responses', query] as const,
  sources: ['admin', 'api-response-studio', 'sources'] as const,
};
