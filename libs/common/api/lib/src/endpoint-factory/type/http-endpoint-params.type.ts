import type { HttpMethod } from "../../enum";
import type { HttpHeaders } from "../../http-client/type";
import type { ValidationFunction } from "./validation-function.type";

export interface EndpointDefinition<
  TData = undefined,
  TQuery = undefined,
  TParams = undefined,
  TSuccess = unknown,
  TError = unknown,
> {
  method: HttpMethod;
  url: string | ((params: TParams) => string);
  headers?: HttpHeaders;
  data?: ValidationFunction<TData>;
  query?: ValidationFunction<TQuery>;
  params?: ValidationFunction<TParams>;
  response?: ValidationFunction<TSuccess>;
  errorResponse?: ValidationFunction<TError>;
}

export type HttpEndpointParams<
  TData = undefined,
  TQuery = undefined,
  TParams = undefined,
  TSuccess = unknown,
  TError = unknown,
> = EndpointDefinition<TData, TQuery, TParams, TSuccess, TError>;
