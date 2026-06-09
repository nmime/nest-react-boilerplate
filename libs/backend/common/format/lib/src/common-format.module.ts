import { Module } from "@nestjs/common";
import { CommonFormatService } from "./service";

@Module({
  providers: [CommonFormatService],
  exports: [CommonFormatService],
})
export class CommonFormatModule {}
