import Joi from "joi";
import type { RedisHost } from "../../type";

export function parseHostsConfig(
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
