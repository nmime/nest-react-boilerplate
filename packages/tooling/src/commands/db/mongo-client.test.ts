// @requirements REQ-RUNTIME-DATABASE-008
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  DefaultMongoDatabaseToolsImage,
  DefaultMongoDatabaseToolsVersion,
  createMongoArchiveEnvironment,
  createMongoDockerInvocation,
  createMongoLocalInvocation,
  createMongoOperationEnvironment,
  parseMongoDatabaseToolsVersion,
  redactMongoConnectionString,
  selectMongoClientMode,
} from "./mongo-client.ts";

function mongoUri(): string {
  const url = new URL("mongodb://localhost/nest_react_boilerplate?replicaSet=rs0");
  url.username = "app";
  url.password = ["example", "password"].join("-");
  url.searchParams.set("authToken", ["example", "token"].join("-"));
  return url.toString();
}

describe("MongoDB Database Tools planner", () => {
  it("requires a database-matching replica-set URI without exposing credentials", () => {
    const uri = mongoUri();
    assert.deepEqual(
      createMongoOperationEnvironment({
        MONGODB_URI: uri,
        MONGODB_DATABASE: "nest_react_boilerplate",
        MONGODB_REPLICA_SET: "rs0",
      }),
      {
        uri,
        database: "nest_react_boilerplate",
        replicaSet: "rs0",
      },
    );
    assert.throws(
      () =>
        createMongoOperationEnvironment({
          MONGODB_URI: "mongodb://user:secret@localhost/nest_react_boilerplate",
          MONGODB_DATABASE: "nest_react_boilerplate",
          MONGODB_REPLICA_SET: "rs0",
        }),
      (error: unknown) =>
        error instanceof Error &&
        !error.message.includes("secret") &&
        /replicaSet/u.test(error.message),
    );

    const seedListUri = "mongodb://user:secret@mongo-a:27017,mongo-b:27018/nest_react_boilerplate?replicaSet=rs0";
    assert.equal(
      createMongoOperationEnvironment({
        MONGODB_URI: seedListUri,
        MONGODB_DATABASE: "nest_react_boilerplate",
        MONGODB_REPLICA_SET: "rs0",
      }).uri,
      seedListUri,
    );
    assert.doesNotMatch(redactMongoConnectionString(seedListUri), /secret/u);
  });

  it("redacts credentials and sensitive URI options", () => {
    const redacted = redactMongoConnectionString(mongoUri());
    assert.equal(redacted.includes("example-password"), false);
    assert.equal(redacted.includes("example-token"), false);
    assert.match(redacted, /replicaSet=rs0/u);
  });

  it("constructs credential-safe database-scoped archive and gzip commands", () => {
    const uri = mongoUri();
    const localBackup = createMongoLocalInvocation({
      connectionString: uri,
      database: "nest_react_boilerplate",
      operation: "backup",
      archivePath: "backups/app.archive.gz",
    });
    const dockerRestore = createMongoDockerInvocation({
      connectionString: uri,
      database: "nest_react_boilerplate",
      operation: "restore",
      archivePath: "backups/app.archive.gz",
    });

    const backupCommand = [localBackup.command, ...localBackup.args].join(" ");
    const restoreCommand = [dockerRestore.command, ...dockerRestore.args].join(" ");
    for (const invocation of [localBackup, dockerRestore]) {
      assert.equal(
        [invocation.command, ...invocation.args].join(" ").includes(new URL(uri).password),
        false,
      );
      assert.equal(invocation.env.MONGODB_URI, uri);
    }
    assert.match(backupCommand, /mongodump.*--db.*--archive.*--gzip/u);
    assert.doesNotMatch(backupCommand, /--oplog(?:\s|$)/u);
    assert.match(restoreCommand, new RegExp(DefaultMongoDatabaseToolsImage.replaceAll(".", "\\."), "u"));
    assert.match(restoreCommand, /mongorestore.*--drop.*--stopOnError.*--nsInclude/u);
    assert.doesNotMatch(restoreCommand, /--oplogReplay/u);
  });

  it("uses oplog capture and replay only for full replica-set archives", () => {
    const backup = createMongoLocalInvocation({
      connectionString: mongoUri(),
      operation: "backup",
      archivePath: "backups/full.archive.gz",
    });
    const restore = createMongoLocalInvocation({
      connectionString: mongoUri(),
      operation: "restore",
      archivePath: "backups/full.archive.gz",
    });
    assert.match(backup.args.join(" "), /--archive.*--gzip --oplog/u);
    assert.match(restore.args.join(" "), /--archive.*--gzip.*--oplogReplay/u);
    assert.doesNotMatch(backup.args.join(" "), /--db/u);
    assert.doesNotMatch(restore.args.join(" "), /--nsInclude/u);
    assert.equal(new URL(String(backup.env.MONGODB_URI)).pathname, "/");
    assert.equal(new URL(String(backup.env.MONGODB_URI)).searchParams.get("authSource"), "nest_react_boilerplate");
  });

  it("loads a deployment-wide backup/restore principal URI from a secret file", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "nrb-mongo-archive-"));
    context.after(() => rmSync(directory, { force: true, recursive: true }));
    const uriFile = join(directory, "mongodb_backup_restore_uri.txt");
    const uri = "mongodb://backup:secret@mongo/?authSource=admin&replicaSet=rs0&retryWrites=true";
    writeFileSync(uriFile, `${uri}\n`, { mode: 0o600 });

    assert.deepEqual(
      createMongoArchiveEnvironment({
        MONGODB_BACKUP_RESTORE_URI_FILE: uriFile,
        MONGODB_DATABASE: "nest_react_boilerplate",
        MONGODB_REPLICA_SET: "rs0",
      }),
      {
        uri,
        database: undefined,
        replicaSet: "rs0",
      },
    );
    assert.throws(
      () =>
        createMongoArchiveEnvironment({
          MONGODB_BACKUP_RESTORE_URI: "mongodb://backup:secret@mongo/app?authSource=admin&replicaSet=rs0",
          MONGODB_DATABASE: "app",
          MONGODB_REPLICA_SET: "rs0",
        }),
      /deployment-wide/u,
    );
    assert.throws(
      () =>
        createMongoArchiveEnvironment({
          MONGODB_BACKUP_RESTORE_URI: "mongodb://backup:secret@mongo/?authSource=app&replicaSet=rs0",
          MONGODB_DATABASE: "app",
          MONGODB_REPLICA_SET: "rs0",
        }),
      /authSource=admin/u,
    );

    const seedListUri =
      "mongodb://backup:secret@mongo-a:27017,mongo-b:27018/?authSource=admin&replicaSet=rs0&retryWrites=true";
    assert.equal(
      createMongoArchiveEnvironment({
        MONGODB_BACKUP_RESTORE_URI: seedListUri,
        MONGODB_DATABASE: "app",
        MONGODB_REPLICA_SET: "rs0",
      }).uri,
      seedListUri,
    );
  });

  it("derives the bundled deployment URI and uses the Compose database network", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "nrb-mongo-bundled-"));
    context.after(() => rmSync(directory, { force: true, recursive: true }));
    const passwordFile = join(directory, "mongodb_backup_restore_password.txt");
    writeFileSync(passwordFile, "bundled-secret\n", { mode: 0o600 });

    const archive = createMongoArchiveEnvironment({
      MONGODB_BACKUP_RESTORE_PASSWORD_FILE: passwordFile,
      MONGODB_BACKUP_RESTORE_USER: "backup_user",
      MONGODB_DATABASE: "nest_react_boilerplate",
      MONGODB_REPLICA_SET: "rs0",
    });
    const parsed = new URL(archive.uri);
    assert.equal(archive.database, undefined);
    assert.equal(parsed.pathname, "/");
    assert.equal(parsed.username, "backup_user");
    assert.equal(parsed.searchParams.get("authSource"), "admin");

    const invocation = createMongoDockerInvocation({
      connectionString: archive.uri,
      operation: "backup",
      archivePath: "backups/full.archive.gz",
      network: "nest-react-boilerplate_database",
    });
    assert.match(invocation.args.join(" "), /--network nest-react-boilerplate_database/u);
    assert.doesNotMatch(invocation.args.join(" "), /host-gateway/u);
  });

  it("selects only the pinned local tools or the pinned Docker fallback", () => {
    assert.equal(
      parseMongoDatabaseToolsVersion(`mongodump version: ${DefaultMongoDatabaseToolsVersion}`),
      DefaultMongoDatabaseToolsVersion,
    );
    assert.deepEqual(
      selectMongoClientMode({
        dockerAvailable: false,
        forceDocker: false,
        localClientExists: true,
        localVersion: DefaultMongoDatabaseToolsVersion,
      }),
      { mode: "local" },
    );
    assert.equal(
      selectMongoClientMode({
        dockerAvailable: true,
        forceDocker: false,
        localClientExists: true,
        localVersion: "100.16.0",
      }).mode,
      "docker",
    );
  });
});
