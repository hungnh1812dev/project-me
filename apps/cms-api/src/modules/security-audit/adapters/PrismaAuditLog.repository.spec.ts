import type { PrismaClient } from '../../../generated/prisma/client';
import { PrismaTransactionRunner } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { AUDIT_ACTIONS } from '../domain/SecurityAudit.constants';
import type { AuditEntry } from '../domain/AuditActor.rules';
import { PrismaAuditLogRepository } from './PrismaAuditLog.repository';

/** A Prisma stand-in whose `auditLog.create` and transactions record their rows. */
function capturingClient() {
  const rows: unknown[] = [];
  const writer = {
    auditLog: {
      create: (args: { data: unknown }) => {
        rows.push(args.data);
        return Promise.resolve(args.data);
      },
    },
  };
  return { rows, writer };
}

/** Writes `entry` the way a use case does: through a unit the runner opened. */
async function writeInUnit(entry: AuditEntry) {
  const client = capturingClient();
  const transaction = capturingClient();
  const runner = new PrismaTransactionRunner(
    {
      $transaction: (work: (tx: unknown) => Promise<unknown>) =>
        work(transaction.writer),
    } as unknown as PrismaClient,
    { warn: jest.fn(), error: jest.fn() },
  );
  const repository = new PrismaAuditLogRepository(
    client.writer as unknown as PrismaClient,
  );
  await runner.run((unit) => repository.write(unit, entry));
  return { client: client.rows, transaction: transaction.rows };
}

describe('PrismaAuditLogRepository (D15)', () => {
  it('maps the actor and defaults optional columns to null', async () => {
    const first = await writeInUnit({
      actor: { type: 'account', accountId: 7 },
      action: AUDIT_ACTIONS.ACCOUNT_DISABLED,
      subject: 'accounts',
      targetId: 'doc-1',
    });
    const second = await writeInUnit({
      actor: { type: 'system' },
      action: AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_OPERATOR,
    });
    expect([...first.transaction, ...second.transaction]).toEqual([
      {
        actorId: 7,
        actorType: 'account',
        action: 'account.disabled',
        subject: 'accounts',
        targetId: 'doc-1',
        metadata: {},
        ip: null,
      },
      {
        actorId: null,
        actorType: 'system',
        action: 'two_factor.reset_by_operator',
        subject: null,
        targetId: null,
        metadata: {},
        ip: null,
      },
    ]);
  });

  it('records the token id of an API token actor in metadata', async () => {
    const { transaction } = await writeInUnit({
      actor: { type: 'api_token', accountId: 3, tokenId: 11 },
      action: AUDIT_ACTIONS.ROLE_UPDATED,
      metadata: { fields: ['name'] },
    });
    expect(transaction[0]).toMatchObject({
      actorId: 3,
      actorType: 'api_token',
      metadata: { fields: ['name'], tokenId: 11 },
    });
  });

  it('write uses the unit transaction, never the client', async () => {
    const { client, transaction } = await writeInUnit({
      actor: { type: 'system' },
      action: AUDIT_ACTIONS.ACCOUNT_SEEDED,
    });
    expect(transaction).toHaveLength(1);
    expect(client).toHaveLength(0);
  });

  it('writeStandalone uses the client', async () => {
    const client = capturingClient();
    const repository = new PrismaAuditLogRepository(
      client.writer as unknown as PrismaClient,
    );
    await repository.writeStandalone({
      actor: { type: 'system' },
      action: AUDIT_ACTIONS.ACCOUNT_SEEDED,
    });
    expect(client.rows).toHaveLength(1);
  });
});
