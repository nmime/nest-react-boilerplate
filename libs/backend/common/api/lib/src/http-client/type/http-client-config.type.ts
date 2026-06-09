import type { CommonLogger } from "@app/common/shared";

export type HttpHeaders = Record<string, string>;

export interface HttpClientConfig {
  baseUrl?: string;
  headers?: HttpHeaders;
  timeoutMs?: number;
  logger?: CommonLogger;
  fetch?: typeof fetch;
}
