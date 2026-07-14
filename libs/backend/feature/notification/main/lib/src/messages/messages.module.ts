import { Module } from '@nestjs/common';
import { MessageStrategyResolver } from './message.strategy-resolver';

@Module({
  providers: [MessageStrategyResolver],
  exports: [MessageStrategyResolver],
})
export class MessagesModule {}
