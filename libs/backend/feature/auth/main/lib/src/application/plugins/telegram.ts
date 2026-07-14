import type { BetterAuthPlugin } from 'better-auth';
import { APIError } from 'better-auth/api';
import { createAuthEndpoint } from 'better-auth/api';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { parse as parseTmaInitData, validate as validateTmaInitData } from '@tma.js/init-data-node';

export interface TelegramPluginOptions {
  botToken?: string;
  maxAgeSeconds?: number;
}

export const telegramPlugin = (options: TelegramPluginOptions = {}): BetterAuthPlugin => ({
  id: 'telegram',
  init: () => {},
  endpoints: {
    telegramWebLogin: createAuthEndpoint(
      '/telegram/web-login',
      {
        method: 'POST',
        body: z.object({
          payload: z.record(z.string(), z.any()),
          tenantId: z.string().optional(),
          intent: z.string().optional(),
          linkToken: z.string().optional(),
          returnUrl: z.string().optional(),
        }),
      },
      async (req) => {
        const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
          throw APIError.fromStatus('BAD_REQUEST', { message: 'Provider not configured' });
        }
        const payload = req.body.payload as Record<string, any>;
        const { auth_date, hash, ...data } = payload;
        const sortedKeys = Object.keys(payload)
          .filter((k) => k !== 'hash')
          .sort();
        const checkString = sortedKeys.map((k) => `${k}=${payload[k]}`).join('\n');
        const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calculatedHash = createHmac('sha256', secretKey).update(checkString).digest('hex');
        if (
          !timingSafeEqual(
            Buffer.from(calculatedHash.slice(0, 64).padEnd(64, '\0')),
            Buffer.from(hash.slice(0, 64).padEnd(64, '\0')),
          )
        ) {
          throw APIError.fromStatus('BAD_REQUEST', { message: 'invalid_signature' });
        }
        if (Date.now() / 1000 - Number(auth_date) > (options.maxAgeSeconds || 86400)) {
          throw APIError.fromStatus('BAD_REQUEST', { message: 'payload_expired' });
        }
        return {
          status: 'authenticated',
          identity: {
            provider: 'telegram',
            channel: 'telegram_web_login',
            providerSubject: String(data.id),
            displayName: [data.first_name, data.last_name].filter(Boolean).join(' '),
            username: data.username || null,
            avatarUrl: data.photo_url || null,
            locale: data.language_code || null,
            metadata: { source: 'telegram_web_login' },
          },
        };
      },
    ),
    telegramTma: createAuthEndpoint(
      '/telegram/tma',
      {
        method: 'POST',
        body: z.object({
          initData: z.string(),
          tenantId: z.string().optional(),
          intent: z.string().optional(),
          linkToken: z.string().optional(),
          returnUrl: z.string().optional(),
        }),
      },
      async (req) => {
        const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
          throw APIError.fromStatus('BAD_REQUEST', { message: 'Provider not configured' });
        }
        try {
          validateTmaInitData(req.body.initData, botToken, {
            expiresIn: options.maxAgeSeconds || 86400,
          });
        } catch {
          throw APIError.fromStatus('BAD_REQUEST', { message: 'invalid_signature' });
        }
        const initData = parseTmaInitData(req.body.initData);
        if (!initData.user?.id) {
          throw APIError.fromStatus('BAD_REQUEST', { message: 'invalid_signature' });
        }
        const u = initData.user;
        return {
          status: 'authenticated',
          identity: {
            provider: 'telegram',
            channel: 'telegram_tma',
            providerSubject: String(u.id),
            displayName: [u.first_name, u.last_name].filter(Boolean).join(' '),
            username: u.username || null,
            avatarUrl: u.photo_url || null,
            locale: u.language_code || null,
            metadata: { source: 'telegram_tma', startParam: initData.start_param || null },
          },
        };
      },
    ),
    telegramBotLink: createAuthEndpoint(
      '/telegram/bot-link',
      {
        method: 'POST',
        body: z.object({
          linkToken: z.string(),
          providerSubject: z.string(),
          username: z.string().optional(),
          displayName: z.string().optional(),
          locale: z.string().optional(),
          avatarUrl: z.string().optional(),
        }),
      },
      async (req) => {
        const { providerSubject, username, displayName, locale, avatarUrl } = req.body;
        return {
          status: 'linked',
          identity: {
            provider: 'telegram',
            channel: 'telegram_bot',
            providerSubject,
            displayName,
            username,
            locale,
            avatarUrl,
            metadata: { source: 'telegram_bot' },
          },
        };
      },
    ),
  },
});
