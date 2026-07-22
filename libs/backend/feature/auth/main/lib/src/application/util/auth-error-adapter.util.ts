import { BadRequestException } from '@nestjs/common';
import { InvalidAuthTenantIdError, parseDomainTenantId } from '../../domain';

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
