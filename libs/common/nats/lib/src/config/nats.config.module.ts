import { Module } from "@nestjs/common";
import { NatsConfigService } from "./nats.config.service";

@Module({
  providers: [NatsConfigService],
  exports: [NatsConfigService],
})
export class NatsConfigModule {}
