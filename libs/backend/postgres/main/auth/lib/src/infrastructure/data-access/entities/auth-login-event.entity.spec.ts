import { describe, expect, it } from 'vitest';
import { AuthLoginEventEntity, AuthLoginEventEntitySchema, DefaultAuthTenantId } from './index';

describe('AuthLoginEventEntity', () => {
  it('constructs an append-only event with privacy-safe nullable evidence', () => {
    const event = new AuthLoginEventEntity({
      eventType: 'login',
      outcome: 'success',
      provider: 'telegram',
      channel: 'telegram_tma',
      userId: '00000000-0000-4000-8000-000000000002',
      countryCode: 'UZ',
    });
    expect(event).toMatchObject({
      tenantId: DefaultAuthTenantId,
      eventType: 'login',
      outcome: 'success',
      provider: 'telegram',
      channel: 'telegram_tma',
      countryCode: 'UZ',
      ipAddress: null,
      networkAnonymizedAt: null,
    });
    expect(new AuthLoginEventEntity().id).toBeDefined();
  });

  it('maps exact network fields as nullable retention targets', () => {
    AuthLoginEventEntitySchema.init();
    expect(AuthLoginEventEntitySchema.meta.properties.ipAddress).toMatchObject({ nullable: true });
    expect(AuthLoginEventEntitySchema.meta.properties.networkAnonymizedAt).toMatchObject({ nullable: true });
  });
});
