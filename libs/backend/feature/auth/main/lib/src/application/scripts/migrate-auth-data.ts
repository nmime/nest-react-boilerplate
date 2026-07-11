/**
 * Migration script: copies legacy auth data from the existing MikroORM tables
 * (auth_users, auth_tokens, auth_methods, auth_link_tokens, etc.)
 * into Better-Auth managed tables (better_auth_users, better_auth_sessions,
 * better_auth_accounts, better_auth_verification).
 *
 * Run manually against your database using:
 *   pnpm ts-node libs/backend/feature/auth/main/lib/src/scripts/migrate-auth-data.ts
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

async function main(): Promise<void> {
  console.log('[migrate] connecting to database...');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[migrate] DATABASE_URL is required');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // 1. Migrate users
    console.log('[migrate] migrating users...');
    const { rows: legacyUsers } = await client.query('SELECT * FROM auth_users WHERE email IS NOT NULL');
    let migratedCount = 0;

    for (const user of legacyUsers) {
      await client.query(
        `INSERT INTO better_auth_users
         (id, email, name, tenant_id, roles, permissions, status, locale, theme, password_hash, last_login_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          user.id,
          user.email?.toLowerCase(),
          user.display_name || '',
          user.tenant_id,
          JSON.stringify(user.roles || []),
          JSON.stringify(user.permissions || []),
          user.status || 'active',
          user.locale || 'en',
          user.theme || 'system',
          user.password_hash || '',
          user.last_login_at || new Date(0),
          user.created_at,
          user.updated_at,
        ],
      );

      // 2. Migrate password accounts
      if (user.password_hash) {
        await client.query(
          `INSERT INTO better_auth_accounts
           (id, user_id, provider_id, provider_account_id, password, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [randomUUID(), user.id, 'credential', user.id, user.password_hash, user.created_at, user.updated_at],
        );
      }

      // 3. Migrate external identities
      const { rows: identities } = await client.query(
        'SELECT * FROM auth_external_identities WHERE auth_user_id = $1',
        [user.id],
      );

      for (const ident of identities) {
        await client.query(
          `INSERT INTO better_auth_accounts
           (id, user_id, provider_id, provider_account_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [randomUUID(), user.id, ident.provider, ident.provider_subject, ident.linked_at, ident.updated_at],
        );
      }

      migratedCount++;
    }

    console.log(`[migrate] migrated ${migratedCount} users`);
    console.log('[migrate] done');
  } catch (err) {
    console.error('[migrate] failed', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

void main();
