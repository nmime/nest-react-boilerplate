export interface TmaLaunchState {
  initData?: string;
  startParam?: string;
  isTelegram: boolean;
}

export const mapTmaStartParamToRoute = (startParam?: string): string | null => {
  if (!startParam) {
    return null;
  }

  const normalized = startParam.trim().toLowerCase();
  const routes: Record<string, string> = {
    auth: "/auth",
    home: "/",
    link_discord: "/link/discord",
    link_telegram: "/link/telegram",
    profile: "/profile",
    settings: "/settings",
  };

  return routes[normalized] ?? null;
};
