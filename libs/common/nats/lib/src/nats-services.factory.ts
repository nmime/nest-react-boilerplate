import type { NatsConnection } from "@nats-io/nats-core";
import { Svcm, type Service, type ServiceConfig } from "@nats-io/services";

export function createNatsServiceManager(connection: NatsConnection): Svcm {
  return new Svcm(connection);
}

export async function addNatsService(
  connection: NatsConnection,
  config: ServiceConfig,
): Promise<Service> {
  return await createNatsServiceManager(connection).add(config);
}
