import type { FrontendEnv } from "@app/frontend-ui";

export const getLandingFrontendEnv = (): FrontendEnv =>
  import.meta.env as FrontendEnv;
