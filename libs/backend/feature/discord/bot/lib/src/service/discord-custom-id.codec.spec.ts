import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DiscordCustomIdCodec,
  type DiscordCustomIdAction,
  DiscordCustomIdMaxLength,
  DiscordCustomIdValidationError,
} from './discord-custom-id.codec';

const testSigningKey = ['test', 'signing', 'key', 'with', 'entropy'].join('-');
const now = () => 1_700_000_000_000;

// Forge a custom_id whose signature is valid for a deliberately malformed body,
// so decode() reaches the structural guards that run after signature checks.
function forge(bodyParts: string[]): string {
  const body = bodyParts.join(':');
  const signature = createHmac('sha256', testSigningKey).update(body).digest().subarray(0, 16).toString('base64url');
  return `${body}:${signature}`;
}

describe('DiscordCustomIdCodec', () => {
  it('round trips compact signed owner-scoped component state within Discord length budget', () => {
    const codec = new DiscordCustomIdCodec();
    const customId = codec.encode(
      {
        action: 'link',
        userId: '123456789012345678',
        guildId: '234567890123456789',
        tenantId: '00000000-0000-0000-0000-000000000000',
      },
      { secret: testSigningKey, now, nonceBytes: 6 },
    );

    expect(customId.length).toBeLessThanOrEqual(DiscordCustomIdMaxLength);
    const decoded = codec.decode(customId, { secret: testSigningKey, now });
    expect(decoded).toMatchObject({
      action: 'link',
      userId: '123456789012345678',
      guildId: '234567890123456789',
      tenantId: '00000000000000000000000000000000',
    });
    expect(() => {
      codec.assertOwner(decoded, {
        userId: '123456789012345678',
        guildId: '234567890123456789',
        tenantId: '00000000-0000-0000-0000-000000000000',
      });
    }).not.toThrow();
  });

  it('rejects tampered, expired, and mismatched component ids', () => {
    const codec = new DiscordCustomIdCodec();
    const customId = codec.encode(
      {
        action: 'unlink',
        userId: '123456789012345678',
        guildId: '234567890123456789',
        tenantId: '00000000-0000-0000-0000-000000000000',
      },
      { secret: testSigningKey, now, ttlSeconds: 1 },
    );

    expect(() =>
      codec.decode(customId.replace(':u:', ':l:'), {
        secret: testSigningKey,
        now,
      }),
    ).toThrow(DiscordCustomIdValidationError);
    expect(() =>
      codec.decode(customId, {
        secret: testSigningKey,
        now: () => now() + 2_000,
      }),
    ).toThrow(/expired/u);
    expect(() => {
      codec.assertOwner(codec.decode(customId, { secret: testSigningKey, now }), {
        userId: '999',
        guildId: '234567890123456789',
        tenantId: '00000000-0000-0000-0000-000000000000',
      });
    }).toThrow(/wrong-owner/u);
    expect(() => {
      codec.assertOwner(codec.decode(customId, { secret: testSigningKey, now }), {
        userId: '123456789012345678',
        guildId: '999999999999999999',
        tenantId: '00000000-0000-0000-0000-000000000000',
      });
    }).toThrow(/wrong-guild/u);
    expect(() => {
      codec.assertOwner(codec.decode(customId, { secret: testSigningKey, now }), {
        userId: '123456789012345678',
        guildId: '234567890123456789',
        tenantId: '11111111-1111-1111-1111-111111111111',
      });
    }).toThrow(/wrong-tenant/u);
  });

  it('keeps every supported action within length budget', () => {
    const codec = new DiscordCustomIdCodec();
    const actions: DiscordCustomIdAction[] = ['back', 'home', 'cancel', 'open_app', 'link', 'unlink', 'confirm'];

    for (const action of actions) {
      const customId = codec.encode(
        {
          action,
          userId: '123456789012345678',
          guildId: '234567890123456789',
          tenantId: '00000000-0000-0000-0000-000000000000',
        },
        { secret: testSigningKey, now, nonceBytes: 8 },
      );

      expect(customId.length, action).toBeLessThanOrEqual(DiscordCustomIdMaxLength);
      expect(codec.decode(customId, { secret: testSigningKey, now }).action).toBe(action);
    }
  });

  it('rejects malformed, missing nonce, and oversized custom ids', () => {
    const codec = new DiscordCustomIdCodec();
    const customId = codec.encode(
      {
        action: 'confirm',
        userId: '123456789012345678',
        guildId: null,
        tenantId: '00000000-0000-0000-0000-000000000000',
      },
      { secret: testSigningKey, now },
    );
    const missingNonce = customId.split(':');
    missingNonce[3] = '';

    expect(() => codec.decode('nrb:1:h', { secret: testSigningKey, now })).toThrow(/tampered/u);
    expect(() => codec.decode(missingNonce.join(':'), { secret: testSigningKey, now })).toThrow();
    expect(() =>
      codec.encode(
        {
          action: 'home',
          nonce: 'n'.repeat(80),
          userId: '123456789012345678',
          guildId: '234567890123456789',
          tenantId: '11111111-1111-1111-1111-111111111111',
        },
        { secret: testSigningKey, now },
      ),
    ).toThrow(/exceeds/u);
  });

  it('round trips nonnumeric owner ids with a short signature and trimmed owner guild', () => {
    const codec = new DiscordCustomIdCodec();
    const customId = codec.encode(
      {
        action: 'home',
        nonce: 'nonce',
        userId: 'user-alpha',
        guildId: 'guild-beta',
        tenantId: 'tenant-workspace',
      },
      { secret: testSigningKey, now, signatureBytes: 8 },
    );

    const decoded = codec.decode(customId, {
      secret: testSigningKey,
      now,
      signatureBytes: 8,
    });

    expect(decoded).toMatchObject({
      userId: 'user-alpha',
      guildId: 'guild-beta',
      tenantId: 'tenantworkspace',
    });
    expect(() => {
      codec.assertOwner(decoded, {
        userId: 'user-alpha',
        guildId: ' guild-beta ',
        tenantId: 'tenant-workspace',
      });
    }).not.toThrow();
  });

  it('round trips empty guild scope and matches absent owner guilds', () => {
    const codec = new DiscordCustomIdCodec();
    const customId = codec.encode(
      {
        action: 'home',
        nonce: 'nonce',
        userId: '123456789012345678',
        guildId: null,
        tenantId: '00000000-0000-0000-0000-000000000000',
      },
      { secret: testSigningKey, now },
    );

    const decoded = codec.decode(customId, { secret: testSigningKey, now });

    expect(decoded.guildId).toBe('');
    expect(() => {
      codec.assertOwner(decoded, {
        userId: '123456789012345678',
        tenantId: '00000000-0000-0000-0000-000000000000',
      });
    }).not.toThrow();
  });

  it('rejects an unknown action code before verifying the signature', () => {
    const codec = new DiscordCustomIdCodec();
    expect(() =>
      codec.decode('nrb:1:Z:nonce:1:-:0:1:2:signature', {
        secret: testSigningKey,
        now,
      }),
    ).toThrow(/tampered/u);
  });

  it('rejects validly-signed ids with the wrong prefix or version', () => {
    const codec = new DiscordCustomIdCodec();
    expect(() =>
      codec.decode(forge(['bad', '1', 'h', 'nonce', '1', '-', '0', '1', 'zzzzzzz']), { secret: testSigningKey, now }),
    ).toThrow(/tampered/u);
    expect(() =>
      codec.decode(forge(['nrb', '2', 'h', 'nonce', '1', '-', '0', '1', 'zzzzzzz']), { secret: testSigningKey, now }),
    ).toThrow(/tampered/u);
  });

  it('rejects signatures whose decoded length cannot match', () => {
    const codec = new DiscordCustomIdCodec();
    const customId = codec.encode(
      {
        action: 'home',
        nonce: 'nonce',
        userId: '123456789012345678',
        guildId: null,
        tenantId: '00000000-0000-0000-0000-000000000000',
      },
      { secret: testSigningKey, now },
    );
    const parts = customId.split(':');
    parts[9] = 'x';

    expect(() => codec.decode(parts.join(':'), { secret: testSigningKey, now })).toThrow(/tampered/u);
  });

  it('rejects validly-signed ids with non-numeric issued/expiry stamps', () => {
    const codec = new DiscordCustomIdCodec();
    const customId = forge(['nrb', '1', 'h', 'nonce', '1', '-', '0', '$', 'zz']);
    expect(() => codec.decode(customId, { secret: testSigningKey, now })).toThrow(/tampered/u);
  });

  it('rejects validly-signed ids with non-base36 snowflake segments', () => {
    const codec = new DiscordCustomIdCodec();
    const customId = forge(['nrb', '1', 'h', 'nonce', '!!', '-', '0', '1', 'zzzzzzz']);
    expect(() => codec.decode(customId, { secret: testSigningKey, now })).toThrow(/tampered/u);
  });
});
