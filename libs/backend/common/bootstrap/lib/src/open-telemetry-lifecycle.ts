import {
  Injectable,
  Module,
  type DynamicModule,
  type ForwardReference,
  type OnApplicationShutdown,
  type Type,
} from '@nestjs/common';
import { shutdownOpenTelemetry } from '@app/backend-common-otel';

@Injectable()
export class OpenTelemetryLifecycleProvider implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await shutdownOpenTelemetry();
  }
}

@Module({})
class OpenTelemetryLifecycleRootModule {}

export function withOpenTelemetryLifecycle(module: Type<unknown> | DynamicModule | ForwardReference): DynamicModule {
  return {
    module: OpenTelemetryLifecycleRootModule,
    imports: [module],
    providers: [OpenTelemetryLifecycleProvider],
  };
}
