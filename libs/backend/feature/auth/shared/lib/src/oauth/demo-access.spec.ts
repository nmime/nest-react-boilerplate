// @requirements REQ-AUTH-CREDENTIAL-003
import { describe, expect, it } from 'vitest';
import { principalUserView } from '../auth-session.types';
import type { AuthenticatedPrincipal } from './access-control.types';
import {
  DefaultDemoSubject,
  DemoAuthMethod,
  isDemoPrincipal,
  resolveDemoPrincipal,
  type DemoAccessEnvironment,
} from './demo-access';
import { DefaultAuthTenantId } from './tenant-context';

const enabled = (overrides: DemoAccessEnvironment = {}): DemoAccessEnvironment => ({
  AUTH_DEMO_MODE: 'true',
  ...overrides,
});

describe('resolveDemoPrincipal', () => {
  it('stays off when AUTH_DEMO_MODE is unset', () => {
    expect(resolveDemoPrincipal({})).toBeUndefined();
  });

  it('stays off when AUTH_DEMO_MODE is false', () => {
    expect(resolveDemoPrincipal({ AUTH_DEMO_MODE: 'false' })).toBeUndefined();
  });

  it('rejects an AUTH_DEMO_MODE value that is neither true nor false', () => {
    expect(() => resolveDemoPrincipal({ AUTH_DEMO_MODE: 'yes' })).toThrow(/AUTH_DEMO_MODE/u);
  });

  it('mints a default demo principal when enabled', () => {
    const principal = resolveDemoPrincipal(enabled());

    expect(principal).toMatchObject({
      subject: DefaultDemoSubject,
      tenantId: DefaultAuthTenantId,
      roles: ['user'],
      amr: [DemoAuthMethod],
    });
  });

  it('derives permissions from the configured roles', () => {
    const principal = resolveDemoPrincipal(enabled({ AUTH_DEMO_ROLES: 'user, admin' }));

    expect(principal?.roles).toEqual(['user', 'admin']);
    expect(principal?.permissions).toContain('admin:manage:all');
    expect(principal?.permissions).toContain('profile:read');
  });

  it('falls back to the default role when AUTH_DEMO_ROLES holds only separators', () => {
    expect(resolveDemoPrincipal(enabled({ AUTH_DEMO_ROLES: ' , ' }))?.roles).toEqual(['user']);
  });

  it('rejects a role the RBAC matrix does not define', () => {
    expect(() => resolveDemoPrincipal(enabled({ AUTH_DEMO_ROLES: 'superuser' }))).toThrow(/superuser/u);
  });

  it('rejects a tenant id that is not a UUID', () => {
    expect(() => resolveDemoPrincipal(enabled({ AUTH_DEMO_TENANT_ID: 'tenant-one' }))).toThrow(/AUTH_DEMO_TENANT_ID/u);
  });

  it('carries the configured identity fields', () => {
    const principal = resolveDemoPrincipal(
      enabled({
        AUTH_DEMO_SUBJECT: '22222222-2222-2222-2222-222222222222',
        AUTH_DEMO_TENANT_ID: '33333333-3333-3333-3333-333333333333',
        AUTH_DEMO_EMAIL: 'guest@demo.invalid',
        AUTH_DEMO_DISPLAY_NAME: 'Guest',
      }),
    );

    expect(principal).toMatchObject({
      subject: '22222222-2222-2222-2222-222222222222',
      tenantId: '33333333-3333-3333-3333-333333333333',
      email: 'guest@demo.invalid',
      displayName: 'Guest',
    });
  });

  it('refuses to run in production without an explicit acknowledgement', () => {
    expect(() => resolveDemoPrincipal(enabled({ NODE_ENV: 'production' }))).toThrow(/AUTH_DEMO_ALLOW_PRODUCTION/u);
  });

  it('runs in production once the acknowledgement is set', () => {
    const principal = resolveDemoPrincipal(enabled({ NODE_ENV: 'production', AUTH_DEMO_ALLOW_PRODUCTION: 'true' }));

    expect(principal?.subject).toBe(DefaultDemoSubject);
  });
});

describe('principalUserView', () => {
  it('projects the demo principal onto the account view the app shell renders', () => {
    const principal = resolveDemoPrincipal(enabled({ AUTH_DEMO_ROLES: 'admin' }));

    expect(principalUserView(principal as AuthenticatedPrincipal)).toMatchObject({
      id: DefaultDemoSubject,
      tenantId: DefaultAuthTenantId,
      email: 'demo@example.invalid',
      displayName: 'Demo User',
      roles: ['admin'],
      theme: 'system',
    });
  });

  it('keeps a principal without an email addressable', () => {
    const view = principalUserView({ subject: 's', tenantId: DefaultAuthTenantId, roles: [], permissions: [] });

    expect(view.email).toBeNull();
    expect(view.displayName).toBeUndefined();
  });
});

describe('isDemoPrincipal', () => {
  it('recognises a principal it minted', () => {
    expect(isDemoPrincipal(resolveDemoPrincipal(enabled()))).toBe(true);
  });

  it('rejects undefined', () => {
    expect(isDemoPrincipal(undefined)).toBe(false);
  });

  it('rejects a look-alike principal rebuilt from session data', () => {
    const minted = resolveDemoPrincipal(enabled());
    // A session round-trip produces a structurally identical but distinct object. Demo
    // recognition must not be forgeable by anything that can write to the session store.
    const forged = JSON.parse(JSON.stringify(minted));

    expect(forged).toEqual(minted);
    expect(isDemoPrincipal(forged)).toBe(false);
  });
});
