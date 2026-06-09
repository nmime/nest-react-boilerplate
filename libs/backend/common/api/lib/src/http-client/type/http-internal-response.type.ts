import type { HttpResponse } from "./http-response.type";

export type HttpInternalResponse<T = unknown, E = unknown> = HttpResponse<T, E>;
