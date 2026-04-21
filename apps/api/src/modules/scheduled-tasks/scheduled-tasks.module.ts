import { Module } from '@nestjs/common'

import { ScheduledTasksService } from './scheduled-tasks.service.js'

@Module({
  providers: [ScheduledTasksService],
})
export class ScheduledTasksModule {}
