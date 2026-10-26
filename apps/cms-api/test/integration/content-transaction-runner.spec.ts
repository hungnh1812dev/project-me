import type { NestExpressApplication } from '@nestjs/platform-express';
import { sql } from 'kysely';

import { ContentDbProvider } from '../../src/modules/content-engine/adapters/ContentDatabase.adapter';
import { contentTrxOf } from '../../src/modules/content-engine/adapters/KyselyContentTransactionRunner.adapter';
import {
  CONTENT_TRANSACTION_RUNNER,
  type ContentTransactionRunner,
  type UnitOfWork,
} from '../../src/infrastructure/database/TransactionRunner.port';
import { dbEnvOf, devEnv } from '../fixtures/env.fixture';
import { startPostgres, type TestPostgres } from '../fixtures/postgres.fixture';
import { createTestApp } from '../fixtures/test-app';

describe('CONTENT_TRANSACTION_RUNNER (Postgres 16 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let content: ContentDbProvider;
  let runner: ContentTransactionRunner;

  beforeAll(async () => {
    postgres = await startPostgres();
    app = await createTestApp(
      devEnv({ ...dbEnvOf(postgres.getConnectionUri()) }),
    );
    content = app.get(ContentDbProvider);
    runner = app.get<ContentTransactionRunner>(CONTENT_TRANSACTION_RUNNER);
    await sql`CREATE TABLE content_runner_probe (name text PRIMARY KEY)`.execute(
      content.db,
    );
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
  });

  beforeEach(async () => {
    await sql`DELETE FROM content_runner_probe`.execute(content.db);
  });

  const insertProbe = (unit: UnitOfWork, name: string) =>
    sql`INSERT INTO content_runner_probe (name) VALUES (${name})`.execute(
      contentTrxOf(unit),
    );

  const probeNames = async (): Promise<string[]> => {
    const { rows } = await sql<{
      name: string;
    }>`SELECT name FROM content_runner_probe ORDER BY name`.execute(content.db);
    return rows.map((row) => row.name);
  };

  it('commits two writes together and returns the result', async () => {
    const result = await runner.run(async (unit) => {
      await insertProbe(unit, 'a');
      await insertProbe(unit, 'b');
      return 'done';
    });
    expect(result).toBe('done');
    expect(await probeNames()).toEqual(['a', 'b']);
  });

  it('rolls both writes back when the work throws, and rethrows', async () => {
    await expect(
      runner.run(async (unit) => {
        await insertProbe(unit, 'a');
        await insertProbe(unit, 'b');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await probeNames()).toEqual([]);
  });

  it('runs afterCommit callbacks after the commit, in order, before run resolves', async () => {
    const seen: string[] = [];
    let visibleAtFirstCallback: Promise<string[]> | undefined;
    await runner.run(async (unit) => {
      await insertProbe(unit, 'a');
      unit.afterCommit(() => {
        seen.push('first');
        visibleAtFirstCallback = probeNames();
      });
      unit.afterCommit(() => {
        seen.push('second');
      });
      expect(seen).toEqual([]);
    });
    expect(seen).toEqual(['first', 'second']);
    expect(await visibleAtFirstCallback).toEqual(['a']);
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
      await insertProbe(unit, 'a');
      unit.afterCommit(() => {
        throw new Error('cache drop failed');
      });
      unit.afterCommit(later);
    });
    expect(await probeNames()).toEqual(['a']);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('does not wait for a never-settling callback or hold back later ones', async () => {
    const later = jest.fn();
    await runner.run((unit) => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- the misuse under test
      unit.afterCommit(() => new Promise(() => undefined));
      unit.afterCommit(later);
      return Promise.resolve();
    });
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('logs a rejecting callback without an unhandled rejection', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await runner.run((unit) => {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- the misuse under test
        unit.afterCommit(() => Promise.reject(new Error('late failure')));
        return Promise.resolve();
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
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

  it('throws on a unit that escaped work after the commit or a rollback', async () => {
    let committed: UnitOfWork | undefined;
    await runner.run((unit) => {
      committed = unit;
      return Promise.resolve();
    });
    expect(() => committed?.afterCommit(() => undefined)).toThrow(/committed/);
    expect(() => contentTrxOf(committed as UnitOfWork)).toThrow(/closed/);

    let rolledBack: UnitOfWork | undefined;
    await expect(
      runner.run((unit) => {
        rolledBack = unit;
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(() => rolledBack?.afterCommit(() => undefined)).toThrow(
      /rolledBack/,
    );
  });

  describe('runInSavepoint', () => {
    it('undoes only the failed step and rethrows its error', async () => {
      await runner.run(async (unit) => {
        await insertProbe(unit, 'kept');
        await expect(
          runner.runInSavepoint(unit, async (step) => {
            await insertProbe(step, 'undone');
            throw new Error('step failed');
          }),
        ).rejects.toThrow('step failed');
        await runner.runInSavepoint(unit, (step) => insertProbe(step, 'also'));
      });
      expect(await probeNames()).toEqual(['also', 'kept']);
    });

    it('rolls the steps back with the outer unit', async () => {
      await expect(
        runner.run(async (unit) => {
          await runner.runInSavepoint(unit, (step) => insertProbe(step, 'a'));
          throw new Error('outer failed');
        }),
      ).rejects.toThrow('outer failed');
      expect(await probeNames()).toEqual([]);
    });

    it('puts callbacks on the outer unit: after the outer commit, also from a rolled-back step', async () => {
      const seen: string[] = [];
      await runner.run(async (unit) => {
        await runner.runInSavepoint(unit, (step) => {
          step.afterCommit(() => seen.push('from kept step'));
          return Promise.resolve();
        });
        await expect(
          runner.runInSavepoint(unit, (step) => {
            step.afterCommit(() => seen.push('from undone step'));
            return Promise.reject(new Error('step failed'));
          }),
        ).rejects.toThrow('step failed');
        expect(seen).toEqual([]);
      });
      expect(seen).toEqual(['from kept step', 'from undone step']);
    });

    it('never runs those callbacks when the outer unit rolls back', async () => {
      const callback = jest.fn();
      await expect(
        runner.run(async (unit) => {
          await runner.runInSavepoint(unit, (step) => {
            step.afterCommit(callback);
            return Promise.resolve();
          });
          throw new Error('outer failed');
        }),
      ).rejects.toThrow('outer failed');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  it('contentTrxOf rejects a unit the content runner did not open', () => {
    expect(() => contentTrxOf({ afterCommit: () => undefined })).toThrow(
      TypeError,
    );
  });
});
