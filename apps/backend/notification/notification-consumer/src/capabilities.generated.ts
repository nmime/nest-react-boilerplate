// Generated capability composition surface. `pnpm nrb setup` owns future rewrites.
import { Module } from '@nestjs/common';
import { NotificationMainModule } from '@app/backend-feature-notification-main';

@Module({ imports: [NotificationMainModule.forRoot({ enableConsumer: true, exposeHttp: false })] })
export class NotificationConsumerCapabilitiesModule {}
