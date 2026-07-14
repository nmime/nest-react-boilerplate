import { designColors, designRadii, designSpacing, designTypography } from '@app/common-design-tokens';
import { createFont, createTamagui, createTokens } from 'tamagui';

const nativeFont = createFont({
  family: designTypography.fontSans,
  size: {
    1: 12,
    2: 14,
    3: 16,
    4: 20,
    5: 24,
    6: 32,
  },
  lineHeight: {
    1: 16,
    2: 20,
    3: 24,
    4: 28,
    5: 32,
    6: 40,
  },
  weight: {
    1: '400',
    2: '500',
    3: '600',
    4: '700',
  },
});

export const nativeTokens = createTokens({
  color: {
    accentDark: designColors.dark.accent,
    accentLight: designColors.light.accent,
    backgroundDark: designColors.dark.background,
    backgroundLight: designColors.light.background,
    borderDark: designColors.dark.border,
    borderLight: designColors.light.border,
    destructiveDark: designColors.dark.destructive,
    destructiveLight: designColors.light.destructive,
    foregroundDark: designColors.dark.foreground,
    foregroundLight: designColors.light.foreground,
    primaryDark: designColors.dark.primary,
    primaryLight: designColors.light.primary,
  },
  radius: designRadii,
  size: designSpacing,
  space: {
    ...designSpacing,
    '-1': -designSpacing[1],
    '-2': -designSpacing[2],
    '-3': -designSpacing[3],
    '-4': -designSpacing[4],
  },
  zIndex: {
    0: 0,
    1: 10,
    2: 100,
    3: 1000,
  },
});

export const nativeTamaguiConfig = createTamagui({
  defaultProps: {
    Text: {
      color: '$color',
    },
  },
  fonts: {
    body: nativeFont,
    heading: nativeFont,
  },
  media: {
    gtSm: { minWidth: 641 },
    sm: { maxWidth: 640 },
  },
  shorthands: {
    bg: 'backgroundColor',
    f: 'flex',
    m: 'margin',
    p: 'padding',
    px: 'paddingHorizontal',
    py: 'paddingVertical',
  } as const,
  themes: {
    dark: {
      accent: designColors.dark.accent,
      background: designColors.dark.background,
      borderColor: designColors.dark.border,
      color: designColors.dark.foreground,
      destructive: designColors.dark.destructive,
      primary: designColors.dark.primary,
    },
    light: {
      accent: designColors.light.accent,
      background: designColors.light.background,
      borderColor: designColors.light.border,
      color: designColors.light.foreground,
      destructive: designColors.light.destructive,
      primary: designColors.light.primary,
    },
  },
  tokens: nativeTokens,
});

export type NativeTamaguiConfig = typeof nativeTamaguiConfig;
