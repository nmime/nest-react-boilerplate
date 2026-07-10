/**
 * Create Better-Auth tables directly via raw SQL.
 * Run: pnpm ts-node scripts/create-better-auth-schema.ts
 */

async function main() {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("Creating Better-Auth tables...");

  await client.query(`
    CREATE TABLE IF NOT EXISTS better_auth_users (
      id UUID PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      image VARCHAR(512),
      tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
      roles JSONB DEFAULT '[]',
      permissions JSONB DEFAULT '[]',
      status VARCHAR(20) DEFAULT 'active',
      locale VARCHAR(10) DEFAULT 'en',
      theme VARCHAR(10) DEFAULT 'system',
      password_hash TEXT,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS better_auth_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES better_auth_users(id) ON DELETE CASCADE,
      token VARCHAR(128) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS better_auth_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES better_auth_users(id) ON DELETE CASCADE,
      provider_id VARCHAR(50) NOT NULL,
      provider_account_id VARCHAR(255) NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at TIMESTAMPTZ,
      refresh_token_expires_at TIMESTAMPTZ,
      password TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS better_auth_verification (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      identifier VARCHAR(255) NOT NULL,
      value VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_better_auth_sessions_token ON better_auth_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_better_auth_sessions_user_id ON better_auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_better_auth_accounts_user_id ON better_auth_accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_better_auth_accounts_provider ON better_auth_accounts(provider_id, provider_account_id);
    CREATE INDEX IF NOT EXISTS idx_better_auth_verification_identifier ON better_auth_verification(identifier);
    CREATE INDEX IF NOT EXISTS idx_better_auth_verification_expires ON better_auth_verification(expires_at);
    CREATE INDEX IF NOT EXISTS idx_better_auth_users_email ON better_auth_users(email);
    CREATE INDEX IF NOT EXISTS idx_better_auth_users_tenant ON better_auth_users(tenant_id);
  `);

  console.log("✅ Better-Auth tables created successfully");

  // Verify
  const { rows } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'better_auth_%' ORDER BY table_name",
  );
  console.log("Tables:", rows.map((r) => r.table_name).join(", "));

  await client.end();
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
