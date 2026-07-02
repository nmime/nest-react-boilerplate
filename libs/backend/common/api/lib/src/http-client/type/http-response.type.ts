import type { ApiResponseKind } from "../../enum";

export interface HttpSuccessResponse<T> {
  ok: true;
  kind: ApiResponseKind.Ok;
  status: number;
  headers: Headers;
  data: T;
  requestId: string;
}

export interface HttpFailureResponse<E = unknown> {
  ok: false;
  kind: Exclude<ApiResponseKind, ApiResponseKind.Ok>;
  status?: number;
  headers?: Headers;
  data?: E;
  error?: Error;
  requestId: string;
}

export type HttpResponse<T, E = unknown> =
  HttpSuccessResponse<T> | HttpFailureResponse<E>;
