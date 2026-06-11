import type { FrontendEnv } from "@app/frontend-api-support";

export const getLandingFrontendEnv = (): FrontendEnv =>
  import.meta.env as FrontendEnv;
