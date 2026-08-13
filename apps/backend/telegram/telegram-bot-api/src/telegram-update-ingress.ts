import { BadRequestException } from '@nestjs/common';
import type { InboundCallbackIngress } from '@app/backend-common-redis';

/**
 * The Telegram webhook's parameters for the shared at-most-once guard.
 *
 * A completed update is skipped rather than rejected: Telegram redelivers any update whose webhook
 * response it did not receive, so a redelivery after successful processing is the provider working
 * as designed and the honest answer is a second `200`.
 */
export const telegramUpdateIngress = {
  namespace: ['social-ingress', 'telegram'],
  processingTtlMs: 5 * 60 * 1000,
  completedTtlMs: 7 * 24 * 60 * 60 * 1000,
  onCompleted: 'skip',
  codes: {
    replayed: 'telegram_update_replayed',
    unavailable: 'telegram_replay_protection_unavailable',
    reservationLost: 'telegram_replay_reservation_lost',
  },
} satisfies InboundCallbackIngress;

/** The delivery id Telegram assigns an update, validated where the payload is parsed. */
export function telegramUpdateId(update: unknown): string {
  if (
    !update ||
    typeof update !== 'object' ||
    !('update_id' in update) ||
    !Number.isSafeInteger(update.update_id) ||
    Number(update.update_id) < 0
  ) {
    throw new BadRequestException('telegram_update_id_invalid');
  }

  return String(Number(update.update_id));
}
