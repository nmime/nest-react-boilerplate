import type { HttpRequestConfig } from "./http-request-config.type";

export type HttpMethodRequestConfig<TBody = unknown> = Omit<
  HttpRequestConfig<TBody>,
  "method" | "url" | "data"
>;
