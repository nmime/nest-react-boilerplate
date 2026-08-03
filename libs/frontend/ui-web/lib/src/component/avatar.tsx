import { useState, type FC } from 'react';

export interface AvatarProps {
  readonly src?: string | null;
  readonly name?: string;
  readonly size?: number;
  readonly alt?: string;
  readonly className?: string;
}

const AvatarSizes: Readonly<Record<string, string>> = {
  xs: '16',
  sm: '24',
  md: '32',
  lg: '40',
  xl: '48',
  '2xl': '64',
};

const getFontSize = (size: number): string => {
  if (size <= 24) {
    return '10px';
  }
  if (size <= 32) {
    return '12px';
  }
  if (size <= 48) {
    return '16px';
  }
  return '20px';
};

export const computeInitials = (name: string | undefined): string => {
  if (!name) {
    return '?';
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0);
  if (!first) {
    return '?';
  }
  if (parts.length === 1) {
    return first.toUpperCase();
  }
  const last = parts.at(-1)?.charAt(0);
  return `${first}${last ?? ''}`.toUpperCase();
};

const avatarSaturation = 50;
const avatarMaxLightness = 45;
const avatarTextContrastTarget = 4.5;

const relativeLuminance = (channels: readonly number[]): number => {
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const hslChannels = (hue: number, saturation: number, lightness: number): number[] => {
  const s = saturation / 100;
  const l = lightness / 100;
  const amplitude = s * Math.min(l, 1 - l);
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    return l - amplitude * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [channel(0), channel(8), channel(4)].map((value) => Math.round(value * 255));
};

// White initials on a mid-tone hue fail WCAG AA badly for yellows and greens —
// hue 60 measured 2.41:1 at the original fixed 45% lightness. Darken per hue
// instead of globally so blues keep their brightness and every hue still clears
// 4.5:1 against the white text.
const contrastSafeLightness = (hue: number): number => {
  const whiteLuminance = relativeLuminance([255, 255, 255]);
  for (let lightness = avatarMaxLightness; lightness > 0; lightness -= 1) {
    const luminance = relativeLuminance(hslChannels(hue, avatarSaturation, lightness));
    if ((whiteLuminance + 0.05) / (luminance + 0.05) >= avatarTextContrastTarget) {
      return lightness;
    }
  }
  return 1;
};

const getBackgroundColor = (name: string): string => {
  if (!name) {
    return '#6b7280';
  }
  let hash = 0;
  for (const character of name) {
    hash = character.charCodeAt(0) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, ${avatarSaturation}%, ${contrastSafeLightness(hue)}%)`;
};

interface InitialsFallbackProps {
  readonly initials: string;
  readonly name: string;
  readonly size: number;
  readonly ariaLabel?: string;
  readonly decorative: boolean;
  readonly sizeClass?: string;
  readonly className: string;
}

function InitialsFallback({
  ariaLabel,
  className,
  decorative,
  initials,
  name,
  size,
  sizeClass,
}: InitialsFallbackProps) {
  const sizeModifier = sizeClass ? `avatar--${sizeClass}` : '';
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={ariaLabel}
      role={decorative ? undefined : 'img'}
      className={`avatar avatar--initials ${sizeModifier} ${className}`}
      data-avatar-initials
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: getBackgroundColor(name),
        color: '#fff',
        fontSize: getFontSize(size),
        fontWeight: 600,
        lineHeight: 1,
        userSelect: 'none',
        flexShrink: 0,
        fontFamily: 'inherit',
      }}
    >
      {initials}
    </span>
  );
}

export const Avatar: FC<AvatarProps> = ({ src, name = '', size = 40, alt, className = '' }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const decorative = alt === '';
  const ariaLabel = decorative ? undefined : (alt ?? `Avatar for ${name}`);
  const sizeClass = Object.entries(AvatarSizes).find(([, value]) => Number(value) === size)?.[0];

  if (!src || failedSrc === src) {
    return (
      <InitialsFallback
        initials={computeInitials(name)}
        name={name}
        size={size}
        ariaLabel={ariaLabel}
        decorative={decorative}
        sizeClass={sizeClass}
        className={className}
      />
    );
  }

  const sizeModifier = sizeClass ? `avatar--${sizeClass}` : '';
  return (
    <img
      src={src}
      alt={ariaLabel ?? ''}
      width={size}
      height={size}
      className={`avatar avatar--img ${sizeModifier} ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: 0,
      }}
      onError={() => {
        setFailedSrc(src);
      }}
    />
  );
};

export const UiAvatar = Avatar;
export type UiAvatarProps = AvatarProps;
