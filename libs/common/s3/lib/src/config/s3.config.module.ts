import { Module } from "@nestjs/common";
import { S3ConfigService } from "./s3.config.service";

@Module({
  providers: [S3ConfigService],
  exports: [S3ConfigService],
})
export class S3ConfigModule {}
