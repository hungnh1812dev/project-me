import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import {
  prismaTxOf,
  unitOfWorkFromPrismaTx,
} from '../../src/infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../src/infrastructure/database/TransactionRunner.port';
import { dbEnvOf, devEnv } from '../fixtures/env.fixture';
import { startPostgres } from '../fixtures/postgres.fixture';
import { createTestApp } from '../fixtures/test-app';

describe('CORE_TRANSACTION_RUNNER (Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let runner: TransactionRunner;

  beforeAll(async () => {
    postgres = await startPostgres();
    app = await createTestApp(
      devEnv({ ...dbEnvOf(postgres.getConnectionUri()) }),
    );
    prisma = app.get(PrismaService);
    runner = app.get<TransactionRunner>(CORE_TRANSACTION_RUNNER);
    await prisma.$executeRawUnsafe(
      'CREATE TABLE tx_runner_probe (name text PRIMARY KEY)',
    );
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM tx_runner_probe');
  });

  const insertProbe = (
    tx: ReturnType<typeof prismaTxOf>,
    name: string,
  ): Promise<number> =>
    tx.$executeRaw`INSERT INTO tx_runner_probe (name) VALUES (${name})`;

  const probeNames = async (): Promise<string[]> => {
    const rows = await prisma.$queryRaw<
      { name: string }[]
    >`SELECT name FROM tx_runner_probe ORDER BY name`;
    return rows.map((row) => row.name);
  };

  it('commits two writes together and returns the result', async () => {
    const result = await runner.run(async (unit) => {
      await insertProbe(prismaTxOf(unit), 'a');
      await insertProbe(prismaTxOf(unit), 'b');
      return 'done';
    });
    expect(result).toBe('done');
    expect(await probeNames()).toEqual(['a', 'b']);
  });

  it('rolls both writes back when the work throws, and rethrows', async () => {
    await expect(
      runner.run(async (unit) => {
        await insertProbe(prismaTxOf(unit), 'a');
        await insertProbe(prismaTxOf(unit), 'b');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await probeNames()).toEqual([]);
  });

  it('runs afterCommit callbacks after the commit, in registration order', async () => {
    const seen: string[] = [];
    await runner.run(async (unit) => {
      await insertProbe(prismaTxOf(unit), 'a');
      unit.afterCommit(async () => {
        seen.push(`first sees ${(await probeNames()).join(',')}`);
      });
      unit.afterCommit(() => {
        seen.push('second');
      });
      expect(seen).toEqual([]);
    });
    expect(seen).toEqual(['first sees a', 'second']);
  });

  it('never runs afterCommit callbacks on a rollback', async () => {
    const callback = jest.fn();
    await expect(
      runner.run((unit) => {
        unit.afterCommit(callback);
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(callback).not.toHaveBeenCalled();
  });

  it('keeps the commit and runs later callbacks when one callback throws', async () => {
    const later = jest.fn();
    await runner.run(async (unit) => {
      await insertProbe(prismaTxOf(unit), 'a');
      unit.afterCommit(() => {
        throw new Error('cache drop failed');
      });
      unit.afterCommit(later);
    });
    expect(await probeNames()).toEqual(['a']);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('throws when a callback registers another afterCommit callback', async () => {
    const late = jest.fn();
    const failures: unknown[] = [];
    await runner.run((unit) => {
      unit.afterCommit(() => {
        try {
          unit.afterCommit(late);
        } catch (error) {
          failures.push(error);
        }
      });
      return Promise.resolve();
    });
    expect(failures).toHaveLength(1);
    expect(late).not.toHaveBeenCalled();
  });

  it('throws on a unit that escaped work after the commit', async () => {
    let escaped: UnitOfWork | undefined;
    await runner.run((unit) => {
      escaped = unit;
      return Promise.resolve();
    });
    expect(() => escaped?.afterCommit(() => undefined)).toThrow(/committed/);
    expect(() => prismaTxOf(escaped as UnitOfWork)).toThrow(/closed/);
  });

  it('throws on a unit that escaped work after a rollback', async () => {
    let escaped: UnitOfWork | undefined;
    await expect(
      runner.run((unit) => {
        escaped = unit;
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(() => escaped?.afterCommit(() => undefined)).toThrow(/rolledBack/);
  });

  it('hands a borrowed tx to a migrated module and refuses afterCommit on it', async () => {
    await prisma.$transaction(async (tx) => {
      const unit = unitOfWorkFromPrismaTx(tx);
      await insertProbe(prismaTxOf(unit), 'a');
      expect(() => unit.afterCommit(() => undefined)).toThrow(/borrowed/);
    });
    expect(await probeNames()).toEqual(['a']);
  });

  it('prismaTxOf rejects a unit the Prisma runner did not open', () => {
    expect(() => prismaTxOf({ afterCommit: () => undefined })).toThrow(
      TypeError,
    );
  });
});
