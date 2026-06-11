import { Global, Module } from "@nestjs/common";
import { RedisConfigService } from "./redis.config.service";

@Global()
@Module({
  providers: [RedisConfigService],
  exports: [RedisConfigService],
})
export class RedisConfigModule {}
