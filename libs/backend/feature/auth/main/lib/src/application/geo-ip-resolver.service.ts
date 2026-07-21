import { Injectable, Logger } from '@nestjs/common';
import maxmind, { type CityResponse } from 'maxmind';

export interface GeoIpLocation {
  countryCode?: string;
  region?: string;
  city?: string;
  timezone?: string;
}

interface CityReader {
  get(ip: string): CityResponse | null;
}

@Injectable()
export class GeoIpResolverService {
  private readonly logger = new Logger(GeoIpResolverService.name);
  private readonly databasePath = process.env.AUTH_GEOIP_DATABASE_PATH?.trim();
  private reader?: Promise<CityReader | null>;

  async resolve(input: string | null | undefined): Promise<GeoIpLocation> {
    const ip = normalizeIp(input);
    if (!ip || !maxmind.validate(ip) || isPrivateIp(ip)) {
      return {};
    }
    let record: CityResponse | null | undefined;
    try {
      record = (await this.getReader())?.get(ip);
    } catch (error: unknown) {
      this.logger.warn(
        `GeoIP lookup failed; login event will keep unknown geo dimensions: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {};
    }
    if (!record) {
      return {};
    }
    const subdivision = record.subdivisions?.[0];
    const countryCode = record.country?.iso_code.toUpperCase();
    const region = subdivision?.names.en;
    const city = record.city?.names.en;
    const timezone = record.location?.time_zone;
    return {
      ...(countryCode ? { countryCode } : {}),
      ...(region ? { region } : {}),
      ...(city ? { city } : {}),
      ...(timezone ? { timezone } : {}),
    };
  }

  private getReader(): Promise<CityReader | null> {
    if (!this.databasePath) {
      return Promise.resolve(null);
    }
    this.reader ??= maxmind
      .open<CityResponse>(this.databasePath, { watchForUpdates: true, watchForUpdatesNonPersistent: true })
      .catch((error: unknown) => {
        this.logger.error(
          `GeoIP database could not be opened; login events will keep unknown geo dimensions: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      });
    return this.reader;
  }
}

export const normalizeIp = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
};

const isPrivateIp = (ip: string): boolean =>
  ip === '::1' ||
  ip === '0.0.0.0' ||
  ip.startsWith('10.') ||
  ip.startsWith('127.') ||
  ip.startsWith('192.168.') ||
  /^172\.(?:1[6-9]|2\d|3[01])\./u.test(ip) ||
  /^f[cd][0-9a-f]{2}:/iu.test(ip) ||
  ip.startsWith('fe80:');
