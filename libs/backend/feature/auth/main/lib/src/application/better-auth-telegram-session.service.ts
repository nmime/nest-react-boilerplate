import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Auth } from 'better-auth';
import { BetterAuthInstanceToken } from './better-auth.module';
import { TelegramOidcProviderId } from './telegram-oidc';

export interface BetterAuthTelegramProfile {
  providerSubject: string;
  displayName: string | null;
  avatarUrl: string | null;
}

const TelegramSubjectPattern = /^\d+$/u;

export function toBetterAuthHeaders(
  values: Readonly<Record<string, string | string[] | undefined>> | undefined,
): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(values ?? {})) {
    if (typeof value === 'string') {
      headers.set(name, value);
    } else if (value?.length) {
      headers.set(name, value.join(', '));
    }
  }
  return headers;
}

@Injectable()
export class BetterAuthTelegramSessionService {
  constructor(@Inject(BetterAuthInstanceToken) private readonly betterAuth: Auth) {}

  async requireTelegramProfile(
    requestHeaders: Readonly<Record<string, string | string[] | undefined>> | undefined,
  ): Promise<BetterAuthTelegramProfile> {
    const headers = toBetterAuthHeaders(requestHeaders);
    const session = await this.betterAuth.api.getSession({ headers });
    if (!session?.user) {
      throw new UnauthorizedException('better_auth_session_required');
    }

    const accounts = await this.betterAuth.api.listUserAccounts({ headers });
    const telegramAccount = accounts.find((account) => account.providerId === TelegramOidcProviderId);
    const providerSubject = telegramAccount?.accountId;
    if (!providerSubject || !TelegramSubjectPattern.test(providerSubject)) {
      throw new UnauthorizedException('telegram_better_auth_account_required');
    }

    return {
      providerSubject,
      displayName: session.user.name.trim() || null,
      avatarUrl: session.user.image?.trim() || null,
    };
  }
}
