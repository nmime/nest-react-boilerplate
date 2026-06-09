import { Module } from "@nestjs/common";
import type { DynamicModule, Provider } from "@nestjs/common";
import { S3Service } from "./s3.service";
import {
  InMemoryObjectStorageClient,
  ObjectStorageInjectToken,
  type ObjectStorageClient,
} from "./s3.storage";

export interface S3ModuleOptions {
  client?: ObjectStorageClient;
}

@Module({})
export class S3Module {
  static forRoot(options: S3ModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      {
        provide: ObjectStorageInjectToken,
        useValue: options.client ?? new InMemoryObjectStorageClient(),
      },
      S3Service,
    ];

    return {
      module: S3Module,
      providers,
      exports: providers,
    };
  }
}
