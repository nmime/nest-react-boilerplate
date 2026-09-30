import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Auth } from 'better-auth';
import { InternalException } from '@app/backend-common-exception';
import { BetterAuthInstanceToken } from './better-auth.module';
import { TelegramOidcProviderId } from './telegram-oidc';

export interface BetterAuthTelegramProfile {
  providerSubject: string;
  displayName: string | null;
  avatarUrl: string | null;
}

type RequestHeaderValue = string | string[] | undefined;
const TelegramSubjectPattern = /^\d+$/u;

export function toBetterAuthHeaders(values: Readonly<Record<string, RequestHeaderValue>> | undefined): Headers {
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
    requestHeaders: Readonly<Record<string, RequestHeaderValue>> | undefined,
  ): Promise<BetterAuthTelegramProfile> {
    const headers = toBetterAuthHeaders(requestHeaders);
    const session = await this.betterAuth.api.getSession({
      headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
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

  async revokeSession(requestHeaders: Readonly<Record<string, RequestHeaderValue>> | undefined): Promise<string[]> {
    const headers = toBetterAuthHeaders(requestHeaders);
    const response = await this.betterAuth.api.signOut({
      headers,
      body: { disableRedirect: true },
      asResponse: true,
    });
    if (!response.ok) {
      throw new InternalException({ reason: 'provider_session_revocation_failed' });
    }
    // Better Auth catches adapter deletion errors in signOut. Its success
    // response alone is insufficient: reread the original cookie against the
    // authoritative store, bypassing cached credentials and refresh.
    const remaining = await this.betterAuth.api.getSession({
      headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
    if (remaining) {
      throw new InternalException({ reason: 'provider_session_not_revoked' });
    }
    return response.headers.getSetCookie();
  }
}
