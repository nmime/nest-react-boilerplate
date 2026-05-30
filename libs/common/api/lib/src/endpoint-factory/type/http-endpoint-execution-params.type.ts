import type { HttpHeaders } from "../../http-client/type";

export interface EndpointExecution<TData, TQuery, TParams> {
  data?: TData;
  query?: TQuery;
  params?: TParams;
  headers?: HttpHeaders;
}

export type HttpEndpointExecutionParams<TData, TQuery, TParams> =
  EndpointExecution<TData, TQuery, TParams>;
