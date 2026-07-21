import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationSchedulerCapabilitiesModule } from './capabilities.generated';

@Module({ imports: [ScheduleModule.forRoot(), NotificationSchedulerCapabilitiesModule] })
export class NotificationSchedulerModule {}
