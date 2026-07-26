// @requirements REQ-NOTIFY-TEMPLATE-003
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { MailPaceEmailNotificationProvider } from './mailpace-email-notification.provider';

describe(MailPaceEmailNotificationProvider.name, () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends HTML and inline attachments with an idempotency key', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const provider = new MailPaceEmailNotificationProvider({
      mailPace: { from: 'Example <no-reply@example.com>', serverToken: 'token' },
    } as never);
    await expect(
      provider.send({
        address: 'user@example.com',
        deliveryId: 'delivery-1',
        message: {
          attachments: [
            { cid: 'logo', contentType: 'image/png', filename: 'logo.png', inline: true, source: 'aGVsbG8=' },
          ],
          html: '<strong>Hello</strong>',
          kind: 'email',
          subject: 'Hello',
          text: 'Hello',
        },
      }),
    ).resolves.toEqual({ status: NotificationStatus.Sent });
    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({ 'idempotency-key': 'notification-delivery-1' });
    expect(JSON.parse(typeof request.body === 'string' ? request.body : '')).toMatchObject({
      htmlbody: '<strong>Hello</strong>',
      attachments: [{ cid: '<logo>', content: 'aGVsbG8=', content_type: 'image/png', name: 'logo.png' }],
    });
  });

  it('rejects remote attachment URLs without making a provider request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const provider = new MailPaceEmailNotificationProvider({
      mailPace: { from: 'Example <no-reply@example.com>', serverToken: 'token' },
    } as never);
    await expect(
      provider.send({
        address: 'user@example.com',
        deliveryId: 'delivery-2',
        message: {
          attachments: [{ cid: 'remote', source: 'https://example.com/file.pdf' }],
          kind: 'email',
          subject: 'Hello',
          text: 'Hello',
        },
      }),
    ).resolves.toMatchObject({
      status: NotificationStatus.Error,
      errorReason: NotificationErrorReason.InvalidMessage,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
