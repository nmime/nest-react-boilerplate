import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import type { Result } from 'neverthrow';

/** The part of an account row that decides whether a session may still act as it. */
export interface SessionAccountRecord {
  status: string;
  credentialRevision?: number;
}

/** The part of a principal that carries the credential epoch its session was minted against. */
export interface SessionCredentialEpoch {
  credentialRevision?: number;
}

/**
 * The single decision every database-authoritative session guard has to make about an account row.
 *
 * Each API reloads the account for its own reasons -- fresh RBAC here, an ability there -- but the
 * question of whether the session is still allowed to exist is the same one every time, and it has
 * three parts: the account has to load, it has to be active, and it has to be at the credential
 * epoch the session was minted against. Keeping all three here is what stops a guard from being
 * added that answers only the first two, which is exactly how a password reset ended up revoking
 * sessions on one API while leaving them live on the others.
 *
 * A credential change advances the account's revision, stranding every session that predates it.
 * Sessions and accounts written before the epoch existed carry no revision and read as zero, which
 * matches the column default, so this only ever rejects a genuinely superseded session.
 *
 * @throws {InternalServerErrorException} when the account could not be loaded.
 * @throws {UnauthorizedException} when the account is missing, inactive, or at a newer epoch.
 */
export function requireActiveSessionAccount<TAccount extends SessionAccountRecord, TError>(
  principal: SessionCredentialEpoch,
  loaded: Result<TAccount | null | undefined, TError>,
): TAccount {
  if (loaded.isErr()) {
    throw new InternalServerErrorException();
  }

  const account = loaded.value;
  if (!account || account.status !== 'active') {
    throw new UnauthorizedException();
  }
  if ((principal.credentialRevision ?? 0) !== (account.credentialRevision ?? 0)) {
    throw new UnauthorizedException();
  }

  return account;
}
