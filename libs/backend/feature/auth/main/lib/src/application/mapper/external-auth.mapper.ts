import type { ExternalAuthIdentityView } from "@app/backend-feature-auth-shared";
import type { ExternalIdentityRecord } from "../../infrastructure";
import {
  externalAuthProviderByStorageValue,
  externalAuthProviderChannelByStorageValue,
} from "../const/external-auth.const";
import type { VerifiedExternalProfile } from "../type/external-auth-internal.type";

export function profileToIdentityInput(
  profile: VerifiedExternalProfile,
  tenantId: string,
  userId: string,
) {
  return {
    tenantId,
    userId,
    provider: profile.provider,
    providerSubject: profile.providerSubject,
    channel: profile.channel,
    profileMetadata: profile.metadata ?? {},
    email: profile.email ?? null,
    emailVerified: profile.emailVerified ?? null,
    locale: profile.locale ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    displayName: profile.displayName ?? null,
    username: profile.username ?? null,
    lastAuthenticatedAt: new Date(),
  };
}

export function toIdentityView(
  identity: ExternalIdentityRecord,
): ExternalAuthIdentityView {
  return {
    id: identity.id,
    provider: externalAuthProviderByStorageValue[identity.provider],
    providerSubject: identity.providerSubject,
    channel: externalAuthProviderChannelByStorageValue[identity.channel],
    email: identity.email,
    emailVerified: identity.emailVerified,
    displayName: identity.displayName,
    username: identity.username,
    avatarUrl: identity.avatarUrl,
    linkedAt: identity.linkedAt.toISOString(),
    lastAuthenticatedAt: identity.lastAuthenticatedAt?.toISOString() ?? null,
  };
}
