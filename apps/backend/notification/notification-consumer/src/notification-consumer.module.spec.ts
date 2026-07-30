// @requirements REQ-NOTIFY-PERSISTENCE-005
import { describe, it, expect } from 'vitest';
import { NotificationConsumerModule } from './notification-consumer.module';

describe('NotificationConsumerModule', () => {
  it('should be defined', () => {
    expect(NotificationConsumerModule).toBeDefined();
  });
});
