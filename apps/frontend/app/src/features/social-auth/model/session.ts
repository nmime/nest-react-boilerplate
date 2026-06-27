import type { authApi } from "@app/frontend/api-client";
import type { ExternalAuthResult } from "./types";

export const getSessionFromExternalAuthResult = (
  result: ExternalAuthResult,
): authApi.AuthSessionViewDto | null => result.session ?? null;

export const getReturnUrlFromExternalAuthResult = (
  result: ExternalAuthResult,
): string | null => result.returnUrl ?? null;
