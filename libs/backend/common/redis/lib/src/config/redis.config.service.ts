import { Injectable } from "@nestjs/common";
import { createConfig } from "@app/common-config";
import Joi from "joi";
import { RedisMode } from "../const";
import type { RedisConfig, RedisConnectionConfig, RedisHost } from "../type";

interface RedisEnvironment {
  REDIS_MODE: RedisMode;
  REDIS_URL?: string;
  REDIS_HOSTS: RedisHost[];
  REDIS_PASSWORD?: string;
  REDIS_DB?: number;
  REDIS_SENTINEL_GROUP_IDENTIFIER?: string;
  REDIS_KEY_PREFIX?: string;
  REDIS_LAZY_CONNECT: boolean;
}

const redisHostSchema = Joi.object<RedisHost>({
  host: Joi.string().required(),
  port: Joi.number().integer().port().required(),
});

const schema = Joi.object<RedisEnvironment>({
  REDIS_MODE: Joi.string()
    .valid(RedisMode.Single, RedisMode.Sentinel, RedisMode.Cluster)
    .empty("")
    .default(RedisMode.Single),
  REDIS_URL: Joi.string().empty("").optional(),
  REDIS_HOSTS: Joi.alternatives()
    .try(
      Joi.array().items(redisHostSchema),
      Joi.string().custom(parseHostsConfig, "Redis hosts list"),
    )
    .default([]),
  REDIS_PASSWORD: Joi.string().empty("").optional(),
  REDIS_DB: Joi.number().integer().optional(),
  REDIS_SENTINEL_GROUP_IDENTIFIER: Joi.string().empty("").optional(),
  REDIS_KEY_PREFIX: Joi.string().empty("").optional(),
  REDIS_LAZY_CONNECT: Joi.boolean()
    .truthy("1", "true", "yes", "on")
    .falsy("0", "false", "no", "off")
    .default(true),
});

@Injectable()
export class RedisConfigService {
  protected readonly configService = createConfig<RedisEnvironment>(schema);

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

function parseHostsConfig(
  value: string,
  helpers: Joi.CustomHelpers,
): RedisHost[] {
  if (value === "") {
    return [];
  }

  const hosts: RedisHost[] = [];
  for (const host of value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    const [hostName, port = "6379"] = host.split(":");
    const parsedPort = Number.parseInt(port, 10);

    if (!hostName || !Number.isInteger(parsedPort)) {
      return helpers.error("any.invalid") as never;
    }

    hosts.push({ host: hostName, port: parsedPort });
  }

  return hosts;
}

function toRedisMode(value: RedisConfig["mode"]): RedisMode {
  switch (value) {
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
