import { Injectable } from "@nestjs/common";
import { createConfig } from "@app/common-config";
import { RedisMode } from "../const";
import type { RedisConfig, RedisConnectionConfig, RedisHost } from "../type";
import { redisEnvSchema } from "./redis.env.schema";
import type { RedisEnvironment } from "./redis.env.schema";
import { toRedisMode } from "./util";

@Injectable()
export class RedisConfigService {
  protected readonly configService =
    createConfig<RedisEnvironment>(redisEnvSchema);

  constructor(private readonly options: RedisConfig = {}) {}

  get mode(): RedisMode {
    return this.options.mode === undefined
      ? this.configService.get("REDIS_MODE")
      : toRedisMode(this.options.mode);
  }

  get url(): string | undefined {
    return this.options.url ?? this.configService.get("REDIS_URL");
  }

  get hosts(): RedisHost[] {
    return this.options.hosts ?? this.configService.get("REDIS_HOSTS");
  }

  get password(): string | undefined {
    return this.options.password ?? this.configService.get("REDIS_PASSWORD");
  }

  get db(): number | undefined {
    return this.options.db ?? this.configService.get("REDIS_DB");
  }

  get sentinelGroupIdentifier(): string | undefined {
    return (
      this.options.sentinelGroupIdentifier ??
      this.configService.get("REDIS_SENTINEL_GROUP_IDENTIFIER")
    );
  }

  get keyPrefix(): string | undefined {
    return this.options.keyPrefix ?? this.configService.get("REDIS_KEY_PREFIX");
  }

  get lazyConnect(): boolean {
    return (
      this.options.lazyConnect ?? this.configService.get("REDIS_LAZY_CONNECT")
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
