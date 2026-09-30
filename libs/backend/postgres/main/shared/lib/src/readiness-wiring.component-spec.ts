// @requirements REQ-RUNTIME-HEALTH-001
import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { describe, expect, it } from 'vitest';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import { PostgresMainModule } from './postgres.module';
import { PostgresReadinessHealthIndicator } from './postgres.health';

const describeWithDocker = hasDockerRuntime() ? describe : describe.skip;

describeWithDocker('selected PostgreSQL readiness dependency injection', () => {
  it('queries the initialized database and fails after that database stops', async () => {
    let container: StartedPostgreSqlContainer | undefined = await startPostgresContainer();
    let orm: MikroORM<PostgreSqlDriver> | undefined;
    try {
      orm = await MikroORM.init<PostgreSqlDriver>({
        ...createPostgresContainerMikroOrmOptions(container),
        driver: PostgreSqlDriver,
        discovery: { warnWhenNoEntities: false },
      });
      const moduleRef = await Test.createTestingModule({
        providers: [...(PostgresMainModule.forRoot().providers ?? []), { provide: MikroORM, useValue: orm }],
      }).compile();
      const readiness = moduleRef.get(PostgresReadinessHealthIndicator);
      await expect(readiness.check()).resolves.toMatchObject({ status: 'ok', details: { skipped: false } });
      await stopPostgresContainer(container);
      container = undefined;
      await expect(readiness.check()).resolves.toMatchObject({ status: 'error' });
      await moduleRef.close();
    } finally {
      await orm?.close(true);
      await stopPostgresContainer(container);
    }
  });
});
