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
const KNOWN = ['normalize-emails', 'rehash-passwords', 'fix-refresh-tokens', 'migrate-social-auth'];

if (!migration || !KNOWN.includes(migration)) {
  console.error(`Usage: ts-node scripts/migrate-auth-data.ts <migration> [--dry-run]`);
  console.error(`\nAvailable:\n${KNOWN.map(m => `  ${m}`).join('\n')}`);
  process.exit(1);
}
console.log(`Migration: ${migration}, dry-run: ${dryRun}`);
console.log(`⚠️  Not yet implemented — scaffold only.`);
process.exit(1);
