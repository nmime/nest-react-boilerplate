export const mobileRuntime = {
  appName: "Nest React Mobile",
  status: "Ready for release",
  platforms: ["ios", "android", "web"],
  nativeUiPackage: "@app/frontend-ui-native",
  apiBaseUrlEnv: "EXPO_PUBLIC_API_BASE_URL",
} as const;

export const mobileCapabilityCards = [
  {
    label: "Account shell",
    value: "Expo Router",
    detail:
      "One navigation model covers installed apps and the exported web UI.",
  },
  {
    label: "Native system",
    value: "Shared tokens",
    detail:
      "The screen uses the native facade and design tokens from the repo.",
  },
  {
    label: "Delivery",
    value: "Nx + export",
    detail:
      "Native commands and the web export target are registered for CI and Docker.",
  },
] as const;

export type MobileCapabilityCard = (typeof mobileCapabilityCards)[number];
