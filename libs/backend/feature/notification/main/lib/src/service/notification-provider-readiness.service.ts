import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { HealthIndicator, HealthIndicatorResult } from '@app/backend-common-health';
import { NotificationDeliveryProvider } from '@app/common-notifications';
import { NotificationConfigService } from '../config';
import { NotificationProviderResolver } from '../strategy/transport';

@Injectable()
export class NotificationProviderReadinessService implements HealthIndicator, OnApplicationBootstrap {
  readonly name = 'notification-providers';
  readonly required = true;

  constructor(
    private readonly resolver: NotificationProviderResolver,
    private readonly config: NotificationConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env['NODE_ENV'] !== 'production') {
      return;
    }

    const missing = this.missingRequiredProviders();
    if (missing.length > 0) {
      throw new Error(`Notification scheduler requires configured providers: ${missing.join(', ')}.`);
    }
  }

  check(): HealthIndicatorResult {
    const requiredProviders = this.requiredProviders();
    const providers = this.resolver.readiness().map((readiness) => ({
      ...readiness,
      required: requiredProviders.has(readiness.provider),
    }));
    return {
      name: this.name,
      required: this.required,
      status: providers.some((provider) => provider.required && !provider.configured) ? 'error' : 'ok',
      details: { providers },
    };
  }

  private missingRequiredProviders(): NotificationDeliveryProvider[] {
    const configured = new Map(
      this.resolver.readiness().map((readiness) => [readiness.provider, readiness.configured] as const),
    );
    return [...this.requiredProviders()].filter((provider) => configured.get(provider) !== true);
  }

  private requiredProviders(): Set<NotificationDeliveryProvider> {
    const required = new Set<NotificationDeliveryProvider>([this.config.emailProvider]);
    const authProvider = notificationProvider(process.env['AUTH_NOTIFICATION_PROVIDER']);
    if (authProvider) {
      required.add(authProvider);
    }
    return required;
  }
}

function notificationProvider(value: string | undefined): NotificationDeliveryProvider | undefined {
  const normalized = value?.trim().toLowerCase();
  return Object.values(NotificationDeliveryProvider).find((provider) => provider === normalized);
}
