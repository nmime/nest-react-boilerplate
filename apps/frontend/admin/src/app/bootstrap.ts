import { readLegacyUrlBearerToken, type FrontendEnv } from "@app/frontend-ui";

const getFrontendEnv = (): FrontendEnv =>
  import.meta.env as Readonly<Record<string, boolean | string | undefined>>;

export const getInitialBearerToken = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return readLegacyUrlBearerToken(getFrontendEnv(), window.location.href);
};

export const scrubLegacyAuthTokenParams = (): void => {
  /* v8 ignore next 3 -- React useEffect does not execute during SSR. */
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  let changed = false;
  for (const key of ["token", "admin" + "_token"]) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  if (changed) {
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
};
