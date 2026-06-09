import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";

export interface StartedServiceContainer {
  container: StartedTestContainer;
  host: string;
  port: number;
  url: string;
}

export interface GenericServiceContainerOptions {
  image: string;
  internalPort: number;
  protocol?: string;
  startupTimeoutMs?: number;
  environment?: Record<string, string>;
}

export const DefaultServiceStartupTimeoutMs = 120_000;

export function createGenericServiceContainer(
  options: GenericServiceContainerOptions,
): GenericContainer {
  let container = new GenericContainer(options.image)
    .withExposedPorts(options.internalPort)
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(
      options.startupTimeoutMs ?? DefaultServiceStartupTimeoutMs,
    );

  for (const [key, value] of Object.entries(options.environment ?? {})) {
    container = container.withEnvironment({ [key]: value });
  }

  return container;
}

export async function startGenericServiceContainer(
  options: GenericServiceContainerOptions,
): Promise<StartedServiceContainer> {
  const container = await createGenericServiceContainer(options).start();
  const host = container.getHost();
  const port = container.getMappedPort(options.internalPort);
  const protocol = options.protocol ?? "tcp";

  return {
    container,
    host,
    port,
    url: `${protocol}://${host}:${port}`,
  };
}

export async function stopGenericServiceContainer(
  service: StartedServiceContainer | undefined,
): Promise<void> {
  await service?.container.stop();
}
