import {
  getRequiredApiBaseUrl,
  type FrontendEnv,
} from "@app/frontend/api-support";
import { landingRoutes } from "../../../shared/config";

export const getAuthApiDocsHref = (env: FrontendEnv) => {
  const authApiBaseUrl = getRequiredApiBaseUrl(env, "VITE_AUTH_API_BASE_URL");

  return authApiBaseUrl ? `${authApiBaseUrl}/docs` : landingRoutes.authDocs;
};
