// @requirements REQ-NOTIFY-TEMPLATE-003
// Evidence for: REQ-NOTIFY-TEMPLATE-003
import { describe, expect, it } from 'vitest';
import { NotificationTargetType } from '@app/common-notifications';
import { NotificationStrategyResolverService } from './notification-strategy-resolver.service';

describe(NotificationStrategyResolverService.name, () => {
  it('registers user and both Telegram target types', () => {
    const user = { handleNotification: async () => ({}) } as never;
    const telegram = { handleNotification: async () => ({}) } as never;
    const resolver = new NotificationStrategyResolverService(user, telegram);

    expect(resolver.resolve(NotificationTargetType.User)).toBe(user);
    expect(resolver.resolve(NotificationTargetType.TelegramChat)).toBe(telegram);
    expect(resolver.resolve(NotificationTargetType.SystemTelegramChat)).toBe(telegram);
  });
});
