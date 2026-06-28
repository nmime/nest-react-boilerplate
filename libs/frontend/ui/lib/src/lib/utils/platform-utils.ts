export interface FormatNumberOptions {
  decimals?: number;
  locale?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  useGrouping?: boolean;
}

const normalizeNumericInput = (value: string | number): number => {
  if (typeof value === "number") {
    return value;
  }

  const normalized = value.replace(/[^\d,.-]/gu, "").replace(/,/gu, "");
  return Number(normalized);
};

export function formatNumber(
  value: string | number,
  options: FormatNumberOptions = {},
): string {
  const numericValue = normalizeNumericInput(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  const {
    decimals,
    locale = "en-US",
    maximumFractionDigits = decimals,
    minimumFractionDigits = decimals,
    useGrouping = true,
  } = options;

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits,
    useGrouping,
  }).format(numericValue);
}

export type ClipboardWriter = Pick<Clipboard, "writeText">;

export async function copyToClipboard(
  text: string,
  clipboard: ClipboardWriter | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.clipboard,
): Promise<boolean> {
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function formatPayTime(payTime: string): string {
  const [unit, rawValue] = payTime.split("_");
  const value = Number(rawValue);

  if (!unit || !Number.isFinite(value)) {
    return payTime;
  }

  const singularUnit = unit.endsWith("s") ? unit.slice(0, -1) : unit;
  const label = value === 1 ? singularUnit : `${singularUnit}s`;

  return `${value} ${label}`;
}

export function createSearchFunction<T>(searchFields: Array<keyof T>) {
  return (collection: readonly T[], searchTerm: string): T[] => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    if (!normalizedSearchTerm || searchFields.length === 0) {
      return [...collection];
    }

    const matches = (item: T, exact: boolean) =>
      searchFields.some((field) => {
        const value = item[field];

        if (value == null) {
          return false;
        }

        const normalizedValue = String(value).toLowerCase();
        return exact
          ? normalizedValue === normalizedSearchTerm
          : normalizedValue.includes(normalizedSearchTerm);
      });

    const exactMatches = collection.filter((item) => matches(item, true));
    const partialMatches = collection.filter(
      (item) => !matches(item, true) && matches(item, false),
    );

    return [...exactMatches, ...partialMatches];
  };
}

export function add3DotsInTheStringMiddle(
  value: string,
  edgeLength = 4,
): string {
  if (value.length <= edgeLength * 2 + 3) {
    return value;
  }

  return `${value.slice(0, edgeLength)}...${value.slice(-edgeLength)}`;
}

export interface TmaEnvironment {
  VITE_TMA_APP?: string;
  VITE_XROCKET_WEB_APP?: string;
}

export function isTmaApp(environment: TmaEnvironment = {}): boolean {
  if (
    environment.VITE_TMA_APP === "true" ||
    environment.VITE_XROCKET_WEB_APP === "true"
  ) {
    return true;
  }

  return Boolean(
    typeof window !== "undefined" && window.Telegram?.WebApp !== undefined,
  );
}

const padTimeUnit = (value: number): string => String(value).padStart(2, "0");

export function transformToCountdown(seconds: number, dayFiller = "d"): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safeSeconds / 86_400);
  const hours = Math.floor((safeSeconds % 86_400) / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const time = `${padTimeUnit(hours)}:${padTimeUnit(minutes)}:${padTimeUnit(
    remainingSeconds,
  )}`;

  return days > 0 ? `${days}${dayFiller} ${time}` : time;
}

export interface FormatDateTimeOptions extends Intl.DateTimeFormatOptions {
  locale?: string;
}

export function formatDateTime(
  value: Date | number | string,
  options: FormatDateTimeOptions = {},
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const {
    locale = "en-US",
    dateStyle = "medium",
    timeStyle = "short",
    ...intlOptions
  } = options;

  return new Intl.DateTimeFormat(locale, {
    dateStyle,
    timeStyle,
    ...intlOptions,
  }).format(date);
}

export function openIfExists(
  url: string | null | undefined,
  target = "_blank",
): Window | null {
  if (
    !url ||
    typeof window === "undefined" ||
    typeof window.open !== "function"
  ) {
    return null;
  }

  return window.open(url, target, "noopener,noreferrer");
}
