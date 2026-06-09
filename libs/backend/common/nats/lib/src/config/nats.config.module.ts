import { Global, Module } from "@nestjs/common";
import { NatsConfigService } from "./nats.config.service";

@Global()
@Module({
  providers: [NatsConfigService],
  exports: [NatsConfigService],
})
export class NatsConfigModule {}
