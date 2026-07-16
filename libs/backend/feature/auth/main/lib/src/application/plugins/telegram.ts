import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { parse as parseTmaInitData, validate as validateTmaInitData } from '@tma.js/init-data-node';
import { z } from 'zod';
import { TelegramOidcProviderId, telegramSyntheticEmail } from '../telegram-oidc';

export interface TelegramPluginOptions {
  botToken?: string;
  maxAgeSeconds?: number;
}

const DefaultTmaMaxAgeSeconds = 300;

const optionalText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export const telegramPlugin = (options: TelegramPluginOptions = {}): BetterAuthPlugin => ({
  id: 'telegram',
  init: () => {},
  endpoints: {
    telegramTma: createAuthEndpoint(
      '/telegram/tma',
      {
        method: 'POST',
        body: z.object({
          initData: z.string().min(1),
        }),
      },
      async (ctx) => {
        const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
          throw APIError.fromStatus('BAD_REQUEST', { message: 'provider_not_configured' });
        }

        try {
          validateTmaInitData(ctx.body.initData, botToken, {
            expiresIn: options.maxAgeSeconds ?? DefaultTmaMaxAgeSeconds,
          });
        } catch {
          throw APIError.fromStatus('UNAUTHORIZED', { message: 'invalid_signature' });
        }

        const initData = parseTmaInitData(ctx.body.initData);
        if (!initData.user?.id) {
          throw APIError.fromStatus('UNAUTHORIZED', { message: 'invalid_signature' });
        }

        const telegramUser = initData.user;
        const providerSubject = String(telegramUser.id);
        const email = telegramSyntheticEmail(providerSubject);
        const displayName =
          [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ').trim() ||
          (telegramUser.username ? `@${telegramUser.username}` : `Telegram user ${providerSubject}`);
        const avatarUrl = optionalText(telegramUser.photo_url);

        let account = await ctx.context.internalAdapter.findAccountByProviderId(
          providerSubject,
          TelegramOidcProviderId,
        );
        let user = account ? await ctx.context.internalAdapter.findUserById(account.userId) : null;

        if (account && !user) {
          throw APIError.fromStatus('INTERNAL_SERVER_ERROR', { message: 'telegram_account_user_missing' });
        }

        if (!user) {
          const existingByEmail = await ctx.context.internalAdapter.findUserByEmail(email);
          user = existingByEmail?.user ?? null;
        }

        if (!user) {
          try {
            user = await ctx.context.internalAdapter.createUser({
              email,
              name: displayName,
              image: avatarUrl,
            });
          } catch (error) {
            // Parallel launches can race on the synthetic email. Re-read the
            // winner before treating the request as failed.
            const concurrentUser = await ctx.context.internalAdapter.findUserByEmail(email);
            if (!concurrentUser) {
              throw error;
            }
            user = concurrentUser.user;
          }
        }

        if (!account) {
          try {
            account = await ctx.context.internalAdapter.createAccount({
              accountId: providerSubject,
              providerId: TelegramOidcProviderId,
              userId: user.id,
            });
          } catch (error) {
            // The provider/account unique key is the authority during
            // concurrent TMA launches.
            account = await ctx.context.internalAdapter.findAccountByProviderId(
              providerSubject,
              TelegramOidcProviderId,
            );
            if (!account) {
              throw error;
            }
            if (account.userId !== user.id) {
              const accountUser = await ctx.context.internalAdapter.findUserById(account.userId);
              if (!accountUser) {
                throw APIError.fromStatus('INTERNAL_SERVER_ERROR', { message: 'telegram_account_user_missing' });
              }
              user = accountUser;
            }
          }
        }

        const userUpdates: Record<string, unknown> = {};
        if (user.name !== displayName) {
          userUpdates.name = displayName;
        }
        if (avatarUrl && user.image !== avatarUrl) {
          userUpdates.image = avatarUrl;
        }
        if (Object.keys(userUpdates).length > 0) {
          user = await ctx.context.internalAdapter.updateUser(user.id, userUpdates);
        }

        const session = await ctx.context.internalAdapter.createSession(user.id);
        if (!session) {
          throw APIError.fromStatus('INTERNAL_SERVER_ERROR', { message: 'telegram_session_creation_failed' });
        }
        await setSessionCookie(ctx, { session, user });

        return ctx.json({
          status: 'authenticated',
          token: session.token,
          user,
          session,
          identity: {
            provider: TelegramOidcProviderId,
            channel: 'telegram_tma',
            providerSubject,
            displayName,
            username: optionalText(telegramUser.username),
            avatarUrl,
            locale: optionalText(telegramUser.language_code),
            metadata: {
              source: 'telegram_tma',
              startParam: initData.start_param ?? null,
            },
          },
        });
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
      async (ctx) => {
        const { providerSubject, username, displayName, locale, avatarUrl } = ctx.body;
        return ctx.json({
          status: 'linked',
          identity: {
            provider: TelegramOidcProviderId,
            channel: 'telegram_bot',
            providerSubject,
            displayName,
            username,
            locale,
            avatarUrl,
            metadata: { source: 'telegram_bot' },
          },
        });
      },
    ),
  },
});
