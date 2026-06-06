import { Svcm } from "@nats-io/services";
import type { NatsConnection } from "@nats-io/nats-core";

export function createServices(connection: NatsConnection): Svcm {
  return new Svcm(connection);
}
