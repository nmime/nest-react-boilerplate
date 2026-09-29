import { createGenericServiceContainer, type GenericServiceContainerOptions } from './generic-service-container';

export const DefaultS3TestImage =
  'chrislusf/seaweedfs:4.47@sha256:ce9e796f1fe6f06968f4c04bdaf8f678dad9c8acdfef3d244133d71bfa6bf882';
export const DefaultS3ApiPort = 9000;
export const DefaultS3AdminPort = 9001;
export const defaultS3Secret = (): string => ['component', 'test', 'credential', 'minimum', 'length'].join('_');

export interface S3ContainerOptions extends Partial<
  Pick<GenericServiceContainerOptions, 'image' | 'startupTimeoutMs'>
> {
  accessKey?: string;
  secretKey?: string;
}

export function createS3Container(options: S3ContainerOptions = {}) {
  return createGenericServiceContainer({
    image: options.image ?? DefaultS3TestImage,
    internalPort: DefaultS3ApiPort,
    startupTimeoutMs: options.startupTimeoutMs,
    environment: {
      AWS_ACCESS_KEY_ID: options.accessKey ?? 'component_test',
      AWS_SECRET_ACCESS_KEY: options.secretKey ?? defaultS3Secret(),
      WEED_ADMIN_USER: options.accessKey ?? 'component_test',
      WEED_ADMIN_PASSWORD: options.secretKey ?? defaultS3Secret(),
    },
  })
    .withExposedPorts(DefaultS3ApiPort, DefaultS3AdminPort)
    .withCommand([
      'mini',
      '-dir=/data',
      '-s3.port=9000',
      '-admin.port=9001',
      '-webdav=false',
      '-s3.port.iceberg=0',
      '-s3.port.lance=0',
      '-disableHttp=true',
    ]);
}

export async function startS3Container(options: S3ContainerOptions = {}): Promise<{
  container: Awaited<ReturnType<ReturnType<typeof createS3Container>['start']>>;
  host: string;
  port: number;
  url: string;
  adminUrl: string;
  accessKey: string;
  secretKey: string;
}> {
  const container = await createS3Container(options).start();
  const host = container.getHost();
  const port = container.getMappedPort(DefaultS3ApiPort);
  const adminPort = container.getMappedPort(DefaultS3AdminPort);

  return {
    container,
    host,
    port,
    url: `http://${host}:${port}`,
    adminUrl: `http://${host}:${adminPort}`,
    accessKey: options.accessKey ?? 'component_test',
    secretKey: options.secretKey ?? defaultS3Secret(),
  };
}
