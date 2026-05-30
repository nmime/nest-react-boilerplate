import {
  createGenericServiceContainer,
  type GenericServiceContainerOptions,
  type StartedServiceContainer,
} from "./generic-service-container";

export const DefaultRabbitMqTestImage = "rabbitmq:3-management-alpine";
export const DefaultRabbitMqAmqpPort = 5672;
export const DefaultRabbitMqManagementPort = 15672;
export const defaultRabbitMqTestSecret = (): string =>
  ["component", "test", "credential"].join("_");

export interface RabbitMqContainerOptions extends Partial<
  Pick<GenericServiceContainerOptions, "image" | "startupTimeoutMs">
> {
  username?: string;
  password?: string;
}

export function createRabbitMqContainer(
  options: RabbitMqContainerOptions = {},
) {
  return createGenericServiceContainer({
    image: options.image ?? DefaultRabbitMqTestImage,
    internalPort: DefaultRabbitMqAmqpPort,
    startupTimeoutMs: options.startupTimeoutMs,
    environment: {
      RABBITMQ_DEFAULT_USER: options.username ?? "component_test",
      RABBITMQ_DEFAULT_PASS: options.password ?? defaultRabbitMqTestSecret(),
    },
  }).withExposedPorts(DefaultRabbitMqAmqpPort, DefaultRabbitMqManagementPort);
}

export async function startRabbitMqContainer(
  options: RabbitMqContainerOptions = {},
): Promise<
  StartedServiceContainer & {
    amqpUrl: string;
    managementUrl: string;
    username: string;
    password: string;
  }
> {
  const container = await createRabbitMqContainer(options).start();
  const host = container.getHost();
  const port = container.getMappedPort(DefaultRabbitMqAmqpPort);
  const managementPort = container.getMappedPort(DefaultRabbitMqManagementPort);
  const username = options.username ?? "component_test";
  const password = options.password ?? defaultRabbitMqTestSecret();

  return {
    container,
    host,
    port,
    url: `amqp://${username}:${password}@${host}:${port}`,
    amqpUrl: `amqp://${username}:${password}@${host}:${port}`,
    managementUrl: `http://${host}:${managementPort}`,
    username,
    password,
  };
}
