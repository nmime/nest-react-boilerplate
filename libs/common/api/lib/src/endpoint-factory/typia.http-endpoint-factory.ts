import { randomUUID } from "node:crypto";
import { ApiResponseKind } from "../enum";
import { HttpClient } from "../http-client";
import type {
  HttpFailureResponse,
  HttpResponse,
  QueryValue,
} from "../http-client/type";
import type {
  EndpointDefinition,
  EndpointExecution,
  ValidationFailure,
  ValidationResult,
} from "./type";

function failedValidation(
  kind: ApiResponseKind.RequestValidation | ApiResponseKind.ResponseValidation,
  requestId: string,
  data: unknown,
): HttpFailureResponse {
  return {
    ok: false,
    kind,
    data,
    requestId,
  };
}

export class HttpEndpointFactory {
  constructor(private readonly httpClient: HttpClient) {}

  define<
    TData = undefined,
    TQuery = undefined,
    TParams = undefined,
    TSuccess = unknown,
    TError = unknown,
  >(
    definition: EndpointDefinition<TData, TQuery, TParams, TSuccess, TError>,
  ): (
    execution?: EndpointExecution<TData, TQuery, TParams>,
  ) => Promise<HttpResponse<TSuccess, TError>> {
    return async (execution = {}) => {
      const requestId = randomUUID();
      const dataValidation = definition.data?.(execution.data);
      const queryValidation = definition.query?.(execution.query);
      const paramsValidation = definition.params?.(execution.params);
      const validationErrors = [
        ["data", dataValidation],
        ["query", queryValidation],
        ["params", paramsValidation],
      ]
        .filter((entry): entry is [string, ValidationFailure] => {
          const result = entry[1] as ValidationResult | undefined;
          return result?.success === false;
        })
        .map(([field, result]) => ({ field, errors: result.errors }));

      if (validationErrors.length > 0) {
        return failedValidation(
          ApiResponseKind.RequestValidation,
          requestId,
          validationErrors,
        ) as HttpResponse<TSuccess, TError>;
      }

      const url =
        typeof definition.url === "function"
          ? definition.url(execution.params as TParams)
          : definition.url;
      const response = await this.httpClient.request<TSuccess, TError, TData>({
        data: execution.data,
        headers: { ...definition.headers, ...execution.headers },
        method: definition.method,
        query: execution.query as Record<string, QueryValue> | undefined,
        requestId,
        url,
      });

      const validator = response.ok
        ? definition.response
        : definition.errorResponse;
      const responseValidation = validator?.(response.data);
      if (responseValidation?.success === false) {
        return failedValidation(
          ApiResponseKind.ResponseValidation,
          requestId,
          responseValidation.errors,
        ) as HttpResponse<TSuccess, TError>;
      }

      return response;
    };
  }
}

export class TypiaHttpEndpointFactory extends HttpEndpointFactory {}
