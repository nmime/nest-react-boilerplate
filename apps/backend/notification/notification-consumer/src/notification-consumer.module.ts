import { Module } from '@nestjs/common';
import { NotificationConsumerCapabilitiesModule } from './capabilities.generated';

@Module({ imports: [NotificationConsumerCapabilitiesModule] })
export class NotificationConsumerModule {}
