import type { CommonLogger } from "@app/backend/common/shared";
import type { HttpClient } from "../../http-client";
import type { HttpClientConfig } from "../../http-client/type";

export interface HttpEndpointFactoryParams extends HttpClientConfig {
  logger?: CommonLogger;
  httpClient?: HttpClient;
}
