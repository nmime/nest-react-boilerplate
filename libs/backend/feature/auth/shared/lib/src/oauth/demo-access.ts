import { permissionsForRoles, roleKeys } from '@app/common-authz';
import type { AuthenticatedPrincipal } from './access-control.types';
import { DefaultAuthTenantId, normalizeTenantId } from './tenant-context';

/**
 * OIDC `amr` entry stamped on every principal the demo bypass mints, so audit trails and
 * request logs show that a request was never actually authenticated.
 */
export const DemoAuthMethod = 'demo';

/** Obviously synthetic subject, so a demo row is recognisable wherever it is persisted. */
export const DefaultDemoSubject = '11111111-1111-1111-1111-111111111111';

export const DefaultDemoEmail = 'demo@example.invalid';
export const DefaultDemoDisplayName = 'Demo User';
export const DefaultDemoRoles = ['user'] as const;

/** The environment slice that turns the bypass on and shapes the principal it mints. */
export interface DemoAccessEnvironment {
  NODE_ENV?: string;
  AUTH_DEMO_MODE?: string;
  AUTH_DEMO_ALLOW_PRODUCTION?: string;
  AUTH_DEMO_SUBJECT?: string;
  AUTH_DEMO_TENANT_ID?: string;
  AUTH_DEMO_EMAIL?: string;
  AUTH_DEMO_DISPLAY_NAME?: string;
  AUTH_DEMO_ROLES?: string;
}

/**
 * Identity of the principals this module minted, by object reference.
 *
 * Guards use `isDemoPrincipal` to skip the per-request database hydration that would
 * otherwise reject a subject with no account row. That skip must be impossible to reach with
 * attacker-supplied data, so recognition is object identity rather than an inspectable field:
 * anything rebuilt from a session store, a JWT, or a request body is a different object and
 * fails the check even when it is byte-for-byte identical.
 */
const mintedDemoPrincipals = new WeakSet<AuthenticatedPrincipal>();

/**
 * Builds the principal every request runs as while demo mode is on, or `undefined` when it is
 * off. Throws on a configuration that is on but incoherent, so a demo deployment fails loudly
 * at the first request instead of quietly serving an unauthenticated surface.
 */
export function resolveDemoPrincipal(env: DemoAccessEnvironment = process.env): AuthenticatedPrincipal | undefined {
  if (!readFlag('AUTH_DEMO_MODE', env.AUTH_DEMO_MODE)) {
    return undefined;
  }

  // Demo mode serves every request as the same user with no credential check whatsoever. Being
  // one stray environment variable away from that in production is not a risk worth taking, so
  // a production deployment has to say it twice.
  if (env.NODE_ENV === 'production' && !readFlag('AUTH_DEMO_ALLOW_PRODUCTION', env.AUTH_DEMO_ALLOW_PRODUCTION)) {
    throw new Error(
      'AUTH_DEMO_MODE=true disables authentication for every request and is refused when NODE_ENV=production. ' +
        'Set AUTH_DEMO_ALLOW_PRODUCTION=true as well if this really is a throwaway demo deployment.',
    );
  }

  const principal: AuthenticatedPrincipal = {
    subject: readText(env.AUTH_DEMO_SUBJECT) ?? DefaultDemoSubject,
    tenantId: readTenantId(env.AUTH_DEMO_TENANT_ID),
    email: readText(env.AUTH_DEMO_EMAIL) ?? DefaultDemoEmail,
    displayName: readText(env.AUTH_DEMO_DISPLAY_NAME) ?? DefaultDemoDisplayName,
    roles: readRoles(env.AUTH_DEMO_ROLES),
    permissions: [],
    amr: [DemoAuthMethod],
  };
  // The same derivation the database-backed guards apply, so a demo principal cannot hold a
  // grant that a real account with those roles would not have.
  principal.permissions = permissionsForRoles(principal.roles);

  mintedDemoPrincipals.add(principal);
  return principal;
}

/** Whether this exact object came from `resolveDemoPrincipal` in this process. */
export function isDemoPrincipal(principal: AuthenticatedPrincipal | undefined): boolean {
  return principal !== undefined && mintedDemoPrincipals.has(principal);
}

function readFlag(name: string, value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (normalized === '' || normalized === 'false') {
    return false;
  }
  if (normalized === 'true') {
    return true;
  }
  throw new Error(`${name} must be "true" or "false" (received "${value}").`);
}

function readText(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
}

function readTenantId(value: string | undefined): string {
  const configured = readText(value);
  if (configured === undefined) {
    return DefaultAuthTenantId;
  }

  const normalized = normalizeTenantId(configured);
  if (normalized === undefined) {
    throw new Error(`AUTH_DEMO_TENANT_ID must be a UUID (received "${configured}").`);
  }
  return normalized;
}

function readRoles(value: string | undefined): string[] {
  const configured = readText(value);
  if (configured === undefined) {
    return [...DefaultDemoRoles];
  }

  const roles = configured
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter((role) => role !== '');
  for (const role of roles) {
    // A typo here would otherwise mint a principal with no permissions at all, which reads as a
    // broken demo rather than as a misconfiguration.
    if (!roleKeys.includes(role)) {
      throw new Error(`AUTH_DEMO_ROLES contains an unknown role "${role}"; known roles: ${roleKeys.join(', ')}.`);
    }
  }
  return roles.length === 0 ? [...DefaultDemoRoles] : roles;
}
