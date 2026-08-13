// @requirements REQ-SOCIAL-INGRESS-001
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { telegramUpdateId, telegramUpdateIngress } from './telegram-update-ingress';

describe('telegramUpdateId', () => {
  it('reads the update id Telegram assigns a delivery', () => {
    expect(telegramUpdateId({ update_id: 42, message: { text: 'hi' } })).toBe('42');
  });

  it.each([
    ['no payload at all', undefined],
    ['a payload that is not an object', 'update'],
    ['a payload without an update id', { message: { text: 'hi' } }],
    ['a fractional update id', { update_id: 1.5 }],
    ['an update id beyond safe integer precision', { update_id: 2 ** 53 }],
    ['a negative update id', { update_id: -1 }],
    ['an update id sent as a string', { update_id: '42' }],
  ])('refuses %s', (_case, update) => {
    // Anything that is not a Telegram update id would key the replay reservation on a value the
    // provider never redelivers, which silently turns at-most-once back into at-least-once.
    expect(() => telegramUpdateId(update)).toThrow(BadRequestException);
    expect(() => telegramUpdateId(update)).toThrow('telegram_update_id_invalid');
  });
});

describe('telegramUpdateIngress', () => {
  it('acknowledges a redelivery Telegram already had processed', () => {
    // Telegram resends any update whose webhook response it did not receive, so the redelivery is
    // the provider working as designed and a second 200 is the honest answer.
    expect(telegramUpdateIngress.onCompleted).toBe('skip');
  });

  it('remembers a completed update for longer than Telegram retries it', () => {
    expect(telegramUpdateIngress.completedTtlMs).toBeGreaterThan(24 * 60 * 60 * 1000);
    expect(telegramUpdateIngress.processingTtlMs).toBeLessThan(telegramUpdateIngress.completedTtlMs);
  });

  it('keeps its reservations in its own key namespace', () => {
    expect(telegramUpdateIngress.namespace).toEqual(['social-ingress', 'telegram']);
  });
});
