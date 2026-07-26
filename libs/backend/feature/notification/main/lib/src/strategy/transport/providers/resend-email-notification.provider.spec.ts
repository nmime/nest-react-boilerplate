// @requirements REQ-NOTIFY-TEMPLATE-003
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { ResendEmailNotificationProvider } from './resend-email-notification.provider';

describe(ResendEmailNotificationProvider.name, () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the delivery id as Resend idempotency key', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const provider = new ResendEmailNotificationProvider({
      resend: { apiKey: 'key', from: 'Example <no-reply@example.com>' },
    } as never);

    await expect(
      provider.send({
        address: 'user@example.com',
        deliveryId: 'delivery-1',
        message: {
          kind: 'email',
          subject: 'Confirm',
          text: '123456',
          html: '<strong>123456</strong>',
          attachments: [
            {
              cid: 'logo',
              contentType: 'image/png',
              filename: 'logo.png',
              inline: true,
              source: 'aGVsbG8=',
            },
          ],
        },
      }),
    ).resolves.toEqual({ status: NotificationStatus.Sent });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ headers: expect.objectContaining({ 'idempotency-key': 'notification-delivery-1' }) }),
    );
    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(typeof request.body === 'string' ? request.body : '')).toMatchObject({
      html: '<strong>123456</strong>',
      attachments: [{ content: 'aGVsbG8=', filename: 'logo.png', content_id: 'logo' }],
    });
  });

  it('marks an invalid provider request as a permanent rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'invalid sender' }), { status: 422 })),
    );
    const provider = new ResendEmailNotificationProvider({ resend: { apiKey: 'key', from: 'bad' } } as never);

    await expect(
      provider.send({
        address: 'user@example.com',
        deliveryId: 'delivery-1',
        message: { kind: 'email', subject: 'Confirm', text: '123456' },
      }),
    ).resolves.toMatchObject({
      status: NotificationStatus.Rejected,
      errorReason: NotificationErrorReason.ProviderRejected,
    });
  });
});
