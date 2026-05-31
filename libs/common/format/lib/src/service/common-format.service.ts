export interface FormatNumberOptions {
  locale?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
}

export class CommonFormatService {
  constructor(private readonly defaultLocale = "en-US") {}

  number(value: number, options: FormatNumberOptions = {}): string {
    return new Intl.NumberFormat(options.locale ?? this.defaultLocale, {
      maximumFractionDigits: options.maximumFractionDigits ?? 8,
      minimumFractionDigits: options.minimumFractionDigits ?? 0,
    }).format(value);
  }

  currency(
    value: number,
    currency: string,
    locale = this.defaultLocale,
  ): string {
    return new Intl.NumberFormat(locale, {
      currency,
      style: "currency",
    }).format(value);
  }

  percent(value: number, locale = this.defaultLocale): string {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      style: "percent",
    }).format(value);
  }

  compact(value: number, locale = this.defaultLocale): string {
    return new Intl.NumberFormat(locale, {
      notation: "compact",
    }).format(value);
  }

  date(value: Date | number | string, locale = this.defaultLocale): string {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }
}

export const commonFormat = new CommonFormatService();
