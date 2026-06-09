import type { ApiResponseKind } from "../../enum";

export type HttpEndpointResponseKindMapping<TResponses> = {
  [K in keyof TResponses]: {
    kind: K extends ApiResponseKind ? K : ApiResponseKind;
    data: TResponses[K];
    headers?: Headers;
  };
}[keyof TResponses];
