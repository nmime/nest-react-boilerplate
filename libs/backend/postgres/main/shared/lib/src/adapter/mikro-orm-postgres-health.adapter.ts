import { MikroORM } from "@mikro-orm/core";
import { Injectable, Optional } from "@nestjs/common";
import {
  PostgresDependencyNotConfiguredError,
  PostgresMigrationStatusUnsupportedError,
} from "../exception";
import type {
  PostgresDependencyHealthAdapter,
  PostgresPendingMigration,
} from "../type";
import { normalizePendingMigration } from "../util";

@Injectable()
export class MikroOrmPostgresHealthAdapter implements PostgresDependencyHealthAdapter {
  constructor(@Optional() private readonly orm?: MikroORM | null) {}

  get configured(): boolean {
    return Boolean(this.orm);
  }

  async checkReadiness(): Promise<void> {
    const orm = this.getConfiguredOrm();

    await orm.em.getConnection().execute("select 1");
  }

  async getPendingMigrations(): Promise<readonly PostgresPendingMigration[]> {
    const orm = this.getConfiguredOrm() as unknown as {
      getMigrator?: () => unknown;
    };
    const migrator = orm.getMigrator?.();
    if (!migrator) {
      throw new PostgresMigrationStatusUnsupportedError();
    }

    const pendingMigrationsReader = migrator as {
      getPendingMigrations?: () =>
        Promise<readonly unknown[]> | readonly unknown[];
    };
    if (!pendingMigrationsReader.getPendingMigrations) {
      throw new PostgresMigrationStatusUnsupportedError();
    }

    const pendingMigrations =
      await pendingMigrationsReader.getPendingMigrations();

    return pendingMigrations.map((migration) =>
      normalizePendingMigration(migration),
    );
  }

  private getConfiguredOrm(): MikroORM {
    if (!this.orm) {
      throw new PostgresDependencyNotConfiguredError();
    }

    return this.orm;
  }
}
