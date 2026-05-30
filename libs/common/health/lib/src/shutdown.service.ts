import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownService.name);

  onApplicationShutdown(signal?: string): void {
    const signalSuffix = signal ? `: ${signal}` : "";
    this.logger.log(`Application shutdown${signalSuffix}`);
  }
}
