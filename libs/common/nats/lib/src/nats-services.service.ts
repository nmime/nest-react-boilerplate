import { Injectable } from "@nestjs/common";
import type { RequestManyOptions } from "@nats-io/nats-core";
import type { Service, ServiceClient, ServiceConfig } from "@nats-io/services";
import { createServices } from "./nats-services.factory";
import { NatsService } from "./nats.service";

@Injectable()
export class NatsServicesService {
  constructor(private readonly natsService: NatsService) {}

  get isEnabled(): boolean {
    return this.natsService.isEnabled;
  }

  getManager() {
    return createServices(this.natsService.getConnection());
  }

  async add(config: ServiceConfig): Promise<Service> {
    return await this.getManager().add(config);
  }

  client(options?: RequestManyOptions, prefix?: string): ServiceClient {
    return this.getManager().client(options, prefix);
  }
}
