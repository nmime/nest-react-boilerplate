import type { BetterAuthClientPlugin } from 'better-auth';

export const telegramClient: BetterAuthClientPlugin = {
  id: 'telegram',
  getActions: ($fetch) => ({
    telegram: {
      webLogin: async (data: Record<string, unknown>) => {
        return $fetch('/telegram/web-login', {
          method: 'POST',
          body: data,
        });
      },
      tmaLogin: async (data: Record<string, unknown>) => {
        return $fetch('/telegram/tma', {
          method: 'POST',
          body: data,
        });
      },
      botLink: async (data: Record<string, unknown>) => {
        return $fetch('/telegram/bot-link', {
          method: 'POST',
          body: data,
        });
      },
    },
  }),
};
