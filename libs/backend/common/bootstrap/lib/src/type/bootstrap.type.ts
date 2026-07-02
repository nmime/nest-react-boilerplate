import type {
  DynamicModule,
  ForwardReference,
  INestApplication,
  Type,
} from "@nestjs/common";
import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import type { BootstrapSwaggerConfig } from "./swagger-config.type";

export type ResolvedEntryNestModule =
  Type<unknown> | DynamicModule | ForwardReference;

export type EntryNestModule =
  ResolvedEntryNestModule | Promise<ResolvedEntryNestModule>;

export type PortFactory = (app: INestApplication) => number | Promise<number>;

export type CorsFactory = (
  app: INestApplication,
) => CorsOptions | Promise<CorsOptions>;

export interface BootstrapParams {
  name: string;
  module: EntryNestModule;
  port?: number | PortFactory;
  cors?: CorsOptions | CorsFactory;
  swagger?: BootstrapSwaggerConfig;
  gracefulShutdown?: boolean;
  hooks?: {
    beforeListen?: (app: INestApplication) => Promise<void> | void;
    afterListen?: (app: INestApplication) => Promise<void> | void;
  };
}
