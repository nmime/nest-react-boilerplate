#!/usr/bin/env ts-node
/**
 * Auth data migration script
 *
 * Usage: pnpm exec ts-node scripts/migrate-auth-data.ts <migration> [--dry-run]
 *
 * Available migrations:
 *   normalize-emails    - Normalize all user emails to lowercase
 *   rehash-passwords    - Rehash passwords from legacy algorithm to PBKDF2
 *   fix-refresh-tokens  - Rotate all active refresh tokens
 *   migrate-social-auth - Migrate social auth tokens to encrypted format
 */

const args = process.argv.slice(2);
const migration = args[0];
const dryRun = args.includes('--dry-run');

const KNOWN_MIGRATIONS = ['normalize-emails', 'rehash-passwords', 'fix-refresh-tokens', 'migrate-social-auth'];

if (!migration || !KNOWN_MIGRATIONS.includes(migration)) {
  console.error(`Usage: ts-node scripts/migrate-auth-data.ts <migration> [--dry-run]`);
  console.error(`
Available migrations:
${KNOWN_MIGRATIONS.map(m => `  ${m}`).join('
')}`);
  process.exit(1);
}

console.log(`Migration: ${migration}`);
console.log(`Dry run: ${dryRun}`);
console.log(`
\u26a0\ufe0f  Migration '${migration}' is not yet implemented.`);
console.log(`    This is a scaffold — implement migration logic and run against staging first.`);
process.exit(1);
