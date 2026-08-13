import { BadRequestException } from '@nestjs/common';
import type { InboundCallbackIngress } from '@app/backend-common-redis';

/**
 * The Discord interactions endpoint's parameters for the shared at-most-once guard.
 *
 * A completed interaction is rejected rather than skipped: Discord expects the interaction response
 * in the same request and abandons the token after three seconds, so a redelivery arriving after
 * one was already answered has nothing valid left to reply with.
 */
export const discordInteractionIngress = {
  namespace: ['social-ingress', 'discord'],
  processingTtlMs: 30 * 1000,
  completedTtlMs: 10 * 60 * 1000,
  onCompleted: 'reject',
  codes: {
    replayed: 'discord_interaction_replayed',
    unavailable: 'discord_replay_protection_unavailable',
    reservationLost: 'discord_replay_reservation_lost',
  },
  // `satisfies` rather than an annotation: it keeps `onCompleted` at its literal type, which is what
  // tells the guard this ingress is never skipped and so always hands back a reservation.
} satisfies InboundCallbackIngress;

/** The delivery id Discord assigns an interaction, validated where the payload is parsed. */
export function discordInteractionId(interactionId: string): string {
  if (!/^\d{1,32}$/u.test(interactionId)) {
    throw new BadRequestException('discord_interaction_id_invalid');
  }

  return interactionId;
}
