import { DynamicModule, Global, Inject, Injectable, Module } from "@nestjs/common";
import { getBetterAuthConfig, type BetterAuthConfigOptions } from "./better-auth";
import type { Auth } from "better-auth";

export const BETTER_AUTH_INSTANCE = "BETTER_AUTH_INSTANCE";

export interface BetterAuthModuleOptions extends BetterAuthConfigOptions {
  isGlobal?: boolean;
}

@Global()
@Module({})
export class BetterAuthModule {
  static forRoot(options?: BetterAuthModuleOptions): DynamicModule {
    return {
      module: BetterAuthModule,
      providers: [
        {
          provide: "BETTER_AUTH_MODULE_OPTIONS",
          useValue: options ?? {},
        },
        {
          provide: BETTER_AUTH_INSTANCE,
          useFactory: (opts: BetterAuthConfigOptions): Auth => {
            return getBetterAuthConfig(null, opts);
          },
          inject: ["BETTER_AUTH_MODULE_OPTIONS"],
        },
      ],
      exports: [BETTER_AUTH_INSTANCE],
      global: options?.isGlobal ?? true,
    };
  }
}

@Injectable()
export class BetterAuthService {
  constructor(@Inject(BETTER_AUTH_INSTANCE) private readonly auth: Auth) {}

  getInstance(): Auth {
    return this.auth;
  }
}
