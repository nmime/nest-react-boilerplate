import type { HttpResponse } from "../../http-client/type";
import type { HttpEndpointExecutionParams } from "./http-endpoint-execution-params.type";

export type HttpEndpoint<TData, TQuery, TParams, TSuccess, TError = unknown> = (
  execution?: HttpEndpointExecutionParams<TData, TQuery, TParams>,
) => Promise<HttpResponse<TSuccess, TError>>;
