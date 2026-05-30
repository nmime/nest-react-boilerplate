import { Injectable } from "@nestjs/common";
import { RedisMode } from "../const";
import type { RedisConfig, RedisConnectionConfig, RedisHost } from "../type";

@Injectable()
export class RedisConfigService {
  constructor(private readonly options: RedisConfig = {}) {}

  get mode(): RedisMode {
    return toRedisMode(this.options.mode ?? process.env.REDIS_MODE);
  }

  get url(): string | undefined {
    return emptyToUndefined(this.options.url ?? process.env.REDIS_URL);
  }

  get hosts(): RedisHost[] {
    return this.options.hosts ?? parseHosts(process.env.REDIS_HOSTS);
  }

  get password(): string | undefined {
    return emptyToUndefined(
      this.options.password ?? process.env.REDIS_PASSWORD,
    );
  }

  get db(): number | undefined {
    return this.options.db ?? parseOptionalInteger(process.env.REDIS_DB);
  }

  get sentinelGroupIdentifier(): string | undefined {
    return emptyToUndefined(
      this.options.sentinelGroupIdentifier ??
        process.env.REDIS_SENTINEL_GROUP_IDENTIFIER,
    );
  }

  get keyPrefix(): string | undefined {
    return emptyToUndefined(
      this.options.keyPrefix ?? process.env.REDIS_KEY_PREFIX,
    );
  }

  get lazyConnect(): boolean {
    return (
      this.options.lazyConnect ??
      parseBoolean(process.env.REDIS_LAZY_CONNECT, true)
    );
  }

  get connectionConfig(): RedisConnectionConfig | undefined {
    if (!this.url && this.hosts.length === 0) {
      return undefined;
    }

    if (this.mode === RedisMode.Sentinel && !this.sentinelGroupIdentifier) {
      throw new Error(
        "REDIS_SENTINEL_GROUP_IDENTIFIER is required for sentinel Redis mode.",
      );
    }

    return {
      mode: this.mode,
      url: this.url,
      hosts: this.hosts,
      password: this.password,
      db: this.db,
      sentinelGroupIdentifier: this.sentinelGroupIdentifier,
      keyPrefix: this.keyPrefix,
      lazyConnect: this.lazyConnect,
    };
  }
}

function toRedisMode(value: string | undefined): RedisMode {
  switch (value) {
    case undefined:
    case "":
    case RedisMode.Single:
      return RedisMode.Single;
    case RedisMode.Sentinel:
      return RedisMode.Sentinel;
    case RedisMode.Cluster:
      return RedisMode.Cluster;
    default:
      throw new Error(`Invalid Redis mode: ${value}`);
  }
}

function parseHosts(value: string | undefined): RedisHost[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean)
    .map((host) => {
      const [hostName, port = "6379"] = host.split(":");
      const parsedPort = Number.parseInt(port, 10);

      if (!hostName || !Number.isInteger(parsedPort)) {
        throw new Error(`Invalid Redis host entry: ${host}`);
      }

      return { host: hostName, port: parsedPort };
    });
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid Redis integer value: ${value}`);
  }

  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }

  switch (value.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      throw new Error(`Invalid Redis boolean value: ${value}`);
  }
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}
