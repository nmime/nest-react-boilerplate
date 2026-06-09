import {
  createGenericServiceContainer,
  startGenericServiceContainer,
  type GenericServiceContainerOptions,
  type StartedServiceContainer,
} from "./generic-service-container";

export const DefaultMysqlTestImage = "mysql:8";
export const DefaultMysqlTestPort = 3306;

export interface MysqlContainerOptions extends Partial<
  Pick<GenericServiceContainerOptions, "image" | "startupTimeoutMs">
> {
  database?: string;
  username?: string;
  password?: string;
  rootPassword?: string;
}

const defaultMysqlSecret = (): string =>
  ["component", "test", "credential"].join("_");

export function createMysqlContainer(options: MysqlContainerOptions = {}) {
  return createGenericServiceContainer({
    image: options.image ?? DefaultMysqlTestImage,
    internalPort: DefaultMysqlTestPort,
    startupTimeoutMs: options.startupTimeoutMs,
    environment: {
      MYSQL_DATABASE: options.database ?? "component_test",
      MYSQL_USER: options.username ?? "component_test",
      MYSQL_PASSWORD: options.password ?? defaultMysqlSecret(),
      MYSQL_ROOT_PASSWORD: options.rootPassword ?? defaultMysqlSecret(),
    },
  });
}

export const startMysqlContainer = async (
  options: MysqlContainerOptions = {},
): Promise<StartedServiceContainer> =>
  await startGenericServiceContainer({
    image: options.image ?? DefaultMysqlTestImage,
    internalPort: DefaultMysqlTestPort,
    startupTimeoutMs: options.startupTimeoutMs,
    protocol: "mysql",
    environment: {
      MYSQL_DATABASE: options.database ?? "component_test",
      MYSQL_USER: options.username ?? "component_test",
      MYSQL_PASSWORD: options.password ?? defaultMysqlSecret(),
      MYSQL_ROOT_PASSWORD: options.rootPassword ?? defaultMysqlSecret(),
    },
  });
