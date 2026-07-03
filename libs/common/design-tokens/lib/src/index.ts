export const designRadii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const designSpacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const designColors = {
  light: {
    background: "#f8fafc",
    foreground: "#0f172a",
    card: "#ffffff",
    cardForeground: "#0f172a",
    primary: "#0f172a",
    primaryForeground: "#f8fafc",
    secondary: "#f1f5f9",
    secondaryForeground: "#0f172a",
    muted: "#f1f5f9",
    mutedForeground: "#64748b",
    accent: "#dbeafe",
    accentForeground: "#0f172a",
    destructive: "#ef4444",
    destructiveForeground: "#ffffff",
    border: "#e2e8f0",
    input: "#e2e8f0",
    ring: "#2563eb",
  },
  dark: {
    background: "#0b1120",
    foreground: "#f8fafc",
    card: "#111827",
    cardForeground: "#f8fafc",
    primary: "#f8fafc",
    primaryForeground: "#0f172a",
    secondary: "#1e293b",
    secondaryForeground: "#f8fafc",
    muted: "#1e293b",
    mutedForeground: "#94a3b8",
    accent: "#083344",
    accentForeground: "#f8fafc",
    destructive: "#dc2626",
    destructiveForeground: "#ffffff",
    border: "#334155",
    input: "#334155",
    ring: "#0ea5e9",
  },
} as const;

export const designTypography = {
  fontSans:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as const;

export const webCssVariableMap = {
  "--background": designColors.light.background,
  "--foreground": designColors.light.foreground,
  "--card": designColors.light.card,
  "--card-foreground": designColors.light.cardForeground,
  "--primary": designColors.light.primary,
  "--primary-foreground": designColors.light.primaryForeground,
  "--secondary": designColors.light.secondary,
  "--secondary-foreground": designColors.light.secondaryForeground,
  "--muted": designColors.light.muted,
  "--muted-foreground": designColors.light.mutedForeground,
  "--accent": designColors.light.accent,
  "--accent-foreground": designColors.light.accentForeground,
  "--destructive": designColors.light.destructive,
  "--destructive-foreground": designColors.light.destructiveForeground,
  "--border": designColors.light.border,
  "--input": designColors.light.input,
  "--ring": designColors.light.ring,
  "--xr-radius-sm": `${designRadii.sm / 16}rem`,
  "--xr-radius-md": `${designRadii.md / 16}rem`,
  "--xr-radius-lg": `${designRadii.lg / 16}rem`,
  "--xr-radius-xl": `${designRadii.xl / 16}rem`,
  "--xr-font-family": designTypography.fontSans,
} as const;

export const tamaguiThemeTokens = {
  color: designColors,
  radius: designRadii,
  space: designSpacing,
  font: designTypography,
} as const;

export type DesignColorMode = keyof typeof designColors;
