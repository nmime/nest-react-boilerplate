import { Global, Module } from "@nestjs/common";
import { CommonFormatConfigService } from "./common-format.config.service";

@Global()
@Module({
  providers: [CommonFormatConfigService],
  exports: [CommonFormatConfigService],
})
export class CommonFormatConfigModule {}
