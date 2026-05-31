import {
  createGenericServiceContainer,
  type GenericServiceContainerOptions,
} from "./generic-service-container";

export const DefaultMinioTestImage = "minio/minio:latest";
export const DefaultMinioApiPort = 9000;
export const DefaultMinioConsolePort = 9001;
export const defaultMinioRootSecret = (): string =>
  ["component", "test", "credential", "minimum", "length"].join("_");

export interface MinioContainerOptions extends Partial<
  Pick<GenericServiceContainerOptions, "image" | "startupTimeoutMs">
> {
  rootUser?: string;
  rootPassword?: string;
}

export function createMinioContainer(options: MinioContainerOptions = {}) {
  return createGenericServiceContainer({
    image: options.image ?? DefaultMinioTestImage,
    internalPort: DefaultMinioApiPort,
    startupTimeoutMs: options.startupTimeoutMs,
    environment: {
      MINIO_ROOT_USER: options.rootUser ?? "component_test",
      MINIO_ROOT_PASSWORD: options.rootPassword ?? defaultMinioRootSecret(),
    },
  })
    .withExposedPorts(DefaultMinioApiPort, DefaultMinioConsolePort)
    .withCommand(["server", "/data", "--console-address", ":9001"]);
}

export async function startMinioContainer(
  options: MinioContainerOptions = {},
): Promise<{
  container: Awaited<
    ReturnType<ReturnType<typeof createMinioContainer>["start"]>
  >;
  host: string;
  port: number;
  url: string;
  consoleUrl: string;
  rootUser: string;
  rootPassword: string;
}> {
  const container = await createMinioContainer(options).start();
  const host = container.getHost();
  const port = container.getMappedPort(DefaultMinioApiPort);
  const consolePort = container.getMappedPort(DefaultMinioConsolePort);

  return {
    container,
    host,
    port,
    url: `http://${host}:${port}`,
    consoleUrl: `http://${host}:${consolePort}`,
    rootUser: options.rootUser ?? "component_test",
    rootPassword: options.rootPassword ?? defaultMinioRootSecret(),
  };
}
