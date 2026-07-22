import { DynamicModule, Global, Inject, Injectable, Module } from '@nestjs/common';
import { getBetterAuthConfig, getBaseUrl, type BetterAuthConfigOptions } from './better-auth';
import type { Auth } from 'better-auth';

export { getBaseUrl };
export const BetterAuthInstanceToken = 'BetterAuthInstanceToken';

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
          provide: 'BETTER_AUTH_MODULE_OPTIONS',
          useValue: options ?? {},
        },
        {
          provide: BetterAuthInstanceToken,
          useFactory: (opts: BetterAuthConfigOptions): Auth => getBetterAuthConfig(null, opts),
          inject: ['BETTER_AUTH_MODULE_OPTIONS'],
        },
      ],
      exports: [BetterAuthInstanceToken],
      global: options?.isGlobal ?? true,
    };
  }
}

@Injectable()
export class BetterAuthService {
  constructor(@Inject(BetterAuthInstanceToken) private readonly auth: Auth) {}

  getInstance(): Auth {
    return this.auth;
  }
}
