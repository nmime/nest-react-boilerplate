import {
  createGenericServiceContainer,
  startGenericServiceContainer,
  type GenericServiceContainerOptions,
  type StartedServiceContainer,
} from "./generic-service-container";

export const DefaultRedisTestImage = "redis:7-alpine";
export const DefaultRedisTestPort = 6379;

export type RedisContainerOptions = Partial<
  Pick<
    GenericServiceContainerOptions,
    "image" | "internalPort" | "startupTimeoutMs"
  >
>;

export const createRedisContainer = (options: RedisContainerOptions = {}) =>
  createGenericServiceContainer({
    image: options.image ?? DefaultRedisTestImage,
    internalPort: options.internalPort ?? DefaultRedisTestPort,
    startupTimeoutMs: options.startupTimeoutMs,
  });

export const startRedisContainer = async (
  options: RedisContainerOptions = {},
): Promise<StartedServiceContainer> =>
  await startGenericServiceContainer({
    image: options.image ?? DefaultRedisTestImage,
    internalPort: options.internalPort ?? DefaultRedisTestPort,
    startupTimeoutMs: options.startupTimeoutMs,
    protocol: "redis",
  });
