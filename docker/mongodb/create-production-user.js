const fs = require('fs');

const databaseName = process.env.MONGODB_DATABASE;
const applicationDatabase = db.getSiblingDB(databaseName);
const adminDatabase = db.getSiblingDB('admin');
const runtimeUser = process.env.MONGODB_USER;
const migrationUser = process.env.MONGODB_MIGRATION_USER;
const backupRestoreUser = process.env.MONGODB_BACKUP_RESTORE_USER;
const oplogRestoreRole = 'nrbOplogRestore';

if (new Set([runtimeUser, migrationUser, backupRestoreUser]).size !== 3) {
  throw new Error('MongoDB runtime, migration, and backup/restore users must be distinct');
}

function secret(path) {
  const value = fs.readFileSync(path, 'utf8').trim();
  if (value === '') throw new Error(`MongoDB secret ${path} must not be empty`);
  return value;
}

function upsertUser(database, user, password, roles) {
  if (database.getUser(user) === null) {
    database.createUser({ user, pwd: password, roles });
    return;
  }
  database.updateUser(user, { pwd: password, roles });
}

const oplogRestorePrivileges = [{ resource: { anyResource: true }, actions: ['anyAction'] }];
if (adminDatabase.getRole(oplogRestoreRole) === null) {
  adminDatabase.createRole({ role: oplogRestoreRole, privileges: oplogRestorePrivileges, roles: [] });
} else {
  adminDatabase.updateRole(oplogRestoreRole, { privileges: oplogRestorePrivileges, roles: [] });
}

upsertUser(applicationDatabase, runtimeUser, secret('/run/secrets/mongodb_password'), [
  { role: 'readWrite', db: databaseName },
]);
upsertUser(applicationDatabase, migrationUser, secret('/run/secrets/mongodb_migration_password'), [
  { role: 'readWrite', db: databaseName },
  { role: 'dbAdmin', db: databaseName },
]);
upsertUser(adminDatabase, backupRestoreUser, secret('/run/secrets/mongodb_backup_restore_password'), [
  { role: 'backup', db: 'admin' },
  { role: 'restore', db: 'admin' },
  { role: oplogRestoreRole, db: 'admin' },
]);
