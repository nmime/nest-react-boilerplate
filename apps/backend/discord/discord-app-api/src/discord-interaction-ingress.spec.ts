// @requirements REQ-SOCIAL-INGRESS-001
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { discordInteractionId, discordInteractionIngress } from './discord-interaction-ingress';

describe('discordInteractionId', () => {
  it('reads the snowflake Discord assigns an interaction', () => {
    expect(discordInteractionId('1234567890123456789')).toBe('1234567890123456789');
  });

  it.each([
    ['an empty id', ''],
    ['a non-numeric id', 'abc'],
    ['an id padded with whitespace', ' 123 '],
    ['an id carrying the key delimiter', '123:456'],
    ['an id longer than a snowflake', '1'.repeat(33)],
  ])('refuses %s', (_case, interactionId) => {
    // A malformed id is not something Discord redelivers, so admitting it would key the reservation
    // on a value no retry can match and quietly drop the at-most-once guarantee.
    expect(() => discordInteractionId(interactionId)).toThrow(BadRequestException);
    expect(() => discordInteractionId(interactionId)).toThrow('discord_interaction_id_invalid');
  });
});

describe('discordInteractionIngress', () => {
  it('refuses a redelivery Discord already had answered', () => {
    // Discord expects the response in the same request and abandons the interaction token after
    // three seconds, so a redelivery of an answered interaction has nothing valid left to reply to.
    expect(discordInteractionIngress.onCompleted).toBe('reject');
  });

  it('holds an interaction no longer than Discord waits for its response', () => {
    expect(discordInteractionIngress.processingTtlMs).toBeLessThanOrEqual(60 * 1000);
    expect(discordInteractionIngress.completedTtlMs).toBeGreaterThan(discordInteractionIngress.processingTtlMs);
  });

  it('keeps its reservations in its own key namespace', () => {
    expect(discordInteractionIngress.namespace).toEqual(['social-ingress', 'discord']);
  });
});
