import type { CommonLogger } from "@app/common/shared";
import type { HttpClientConfig } from "./http-client-config.type";

export interface HttpClientParams {
  config?: HttpClientConfig;
  logger?: CommonLogger;
}
