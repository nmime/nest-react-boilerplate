import { Wait } from "testcontainers";
import {
  createGenericServiceContainer,
  type GenericServiceContainerOptions,
  type StartedServiceContainer,
} from "./generic-service-container";

export const DefaultNatsTestImage = "nats:2.10-alpine";
export const DefaultNatsClientPort = 4222;
export const DefaultNatsMonitoringPort = 8222;

export type NatsContainerOptions = Partial<
  Pick<GenericServiceContainerOptions, "image" | "startupTimeoutMs">
>;

export function createNatsContainer(options: NatsContainerOptions = {}) {
  return createGenericServiceContainer({
    image: options.image ?? DefaultNatsTestImage,
    internalPort: DefaultNatsClientPort,
    startupTimeoutMs: options.startupTimeoutMs,
  })
    .withExposedPorts(DefaultNatsClientPort, DefaultNatsMonitoringPort)
    .withCommand(["-m", `${DefaultNatsMonitoringPort}`])
    .withWaitStrategy(Wait.forLogMessage(/Server is ready/));
}

export async function startNatsContainer(
  options: NatsContainerOptions = {},
): Promise<
  StartedServiceContainer & {
    server: string;
    clientUrl: string;
    monitoringPort: number;
    monitoringUrl: string;
  }
> {
  const container = await createNatsContainer(options).start();
  const host = container.getHost();
  const port = container.getMappedPort(DefaultNatsClientPort);
  const monitoringPort = container.getMappedPort(DefaultNatsMonitoringPort);
  const server = `nats://${host}:${port}`;

  return {
    container,
    host,
    port,
    url: server,
    server,
    clientUrl: server,
    monitoringPort,
    monitoringUrl: `http://${host}:${monitoringPort}`,
  };
}
