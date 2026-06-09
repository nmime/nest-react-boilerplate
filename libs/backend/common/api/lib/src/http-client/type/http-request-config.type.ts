import type { HttpMethod } from "../../enum";
import type { HttpHeaders } from "./http-client-config.type";

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean)[];

export interface HttpRequestConfig<TBody = unknown> {
  method?: HttpMethod | `${HttpMethod}`;
  url: string;
  headers?: HttpHeaders;
  query?: Record<string, QueryValue>;
  data?: TBody;
  timeoutMs?: number;
  requestId?: string;
}
