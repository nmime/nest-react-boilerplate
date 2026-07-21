import { DynamicModule, Global, Inject, Injectable, Module } from '@nestjs/common';
import { NotificationService } from '@app/backend-feature-notification-shared';
import { getBetterAuthConfig, getBaseUrl, type BetterAuthConfigOptions } from './better-auth';
import { AuthNotificationPublisher } from './auth-notification.publisher';
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
          useFactory: (opts: BetterAuthConfigOptions, notifications?: NotificationService): Auth => {
            return getBetterAuthConfig(null, {
              ...opts,
              notificationPublisher: new AuthNotificationPublisher(notifications),
            });
          },
          inject: ['BETTER_AUTH_MODULE_OPTIONS', { token: NotificationService, optional: true }],
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
