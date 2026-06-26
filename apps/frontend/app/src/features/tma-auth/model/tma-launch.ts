export type TmaLaunchIntent = "login" | "link";
export type TmaDeepNavigationState =
  | "none"
  | "loading"
  | "unsupported"
  | "not-found";

export interface TmaLaunchState {
  initData?: string;
  intent: TmaLaunchIntent;
  returnUrl?: string;
  startParam?: string;
  isTelegram: boolean;
  mappedRoute: string | null;
  deepNavigationState: TmaDeepNavigationState;
}

interface TmaStartParamTarget {
  intent: TmaLaunchIntent;
  returnUrl?: string;
  route: string | null;
}

const startParamTargets: Record<string, TmaStartParamTarget> = {
  auth: { intent: "login", route: "/auth" },
  home: { intent: "login", route: "/" },
  link: { intent: "link", returnUrl: "/settings", route: "/settings" },
  link_discord: {
    intent: "link",
    returnUrl: "/link/discord",
    route: "/link/discord",
  },
  link_telegram: {
    intent: "link",
    returnUrl: "/settings",
    route: "/settings",
  },
  profile: { intent: "login", route: "/profile" },
  settings: { intent: "login", route: "/settings" },
};

export const normalizeTmaStartParam = (
  startParam?: string | null,
): string | null => {
  const normalized = startParam?.trim().toLowerCase();
  return normalized ? normalized : null;
};

export const parseTmaStartParam = (
  startParam?: string | null,
): TmaStartParamTarget | null => {
  const normalized = normalizeTmaStartParam(startParam);
  if (!normalized) {
    return { intent: "login", route: null };
  }

  return startParamTargets[normalized] ?? null;
};

export const mapTmaStartParamToRoute = (startParam?: string): string | null =>
  parseTmaStartParam(startParam)?.route ?? null;

export const parseTmaLaunchState = (input: {
  initData?: string;
  isTelegram: boolean;
  startParam?: string | null;
}): TmaLaunchState => {
  const normalizedStartParam = normalizeTmaStartParam(input.startParam);
  const target = parseTmaStartParam(normalizedStartParam);
  const isUnknownStartParam = Boolean(normalizedStartParam) && !target;
  const mappedRoute = target?.route ?? null;

  const deepNavigationState: TmaDeepNavigationState = isUnknownStartParam
    ? "not-found"
    : "none";

  return {
    deepNavigationState:
      deepNavigationState === "none" && mappedRoute
        ? "loading"
        : deepNavigationState,
    initData: input.initData,
    intent: target?.intent ?? "login",
    isTelegram: input.isTelegram,
    mappedRoute,
    returnUrl: target?.returnUrl ?? mappedRoute ?? undefined,
    startParam: normalizedStartParam ?? undefined,
  };
};
