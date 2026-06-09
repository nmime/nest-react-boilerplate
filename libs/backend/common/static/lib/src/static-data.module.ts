import { Module } from "@nestjs/common";
import type { DynamicModule, Provider } from "@nestjs/common";
import { StaticDataService } from "./static-data.service";

export const StaticDataRootInjectToken = Symbol("StaticDataRoot");

export interface StaticModuleOptions {
  rootDir: string;
}

@Module({})
export class StaticModule {
  static forRoot(options: StaticModuleOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: StaticDataRootInjectToken, useValue: options.rootDir },
      {
        provide: StaticDataService,
        useFactory: () => new StaticDataService(options.rootDir),
      },
    ];

    return {
      module: StaticModule,
      providers,
      exports: [StaticDataService],
    };
  }
}

export const StaticDataModule = StaticModule;
export type StaticDataModuleOptions = StaticModuleOptions;
