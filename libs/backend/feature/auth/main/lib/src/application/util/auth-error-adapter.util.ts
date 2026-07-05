import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import {
  AuthJwtSigningError,
  InvalidAuthTenantIdError,
  parseDomainTenantId,
  signDomainJwt,
  type JwtSigningEnvironment,
} from "../../domain";

export function parseTenantId(value: string | null | undefined): string {
  try {
    return parseDomainTenantId(value);
  } catch (error) {
    /* v8 ignore next -- parseDomainTenantId currently only throws InvalidAuthTenantIdError; this preserves unexpected-error passthrough below. */
    if (error instanceof InvalidAuthTenantIdError) {
      throw new BadRequestException(error.message);
    }

    /* v8 ignore next -- parseDomainTenantId currently has no non-domain error path. */
    throw error;
  }
}

export function signJwt(
  payload: Record<string, unknown>,
  env: JwtSigningEnvironment,
  expiresIn?: number,
): string {
  try {
    return signDomainJwt(payload, env, expiresIn);
  } catch (error) {
    if (error instanceof AuthJwtSigningError) {
      throw new UnauthorizedException(error.message);
    }

    throw error;
  }
}
