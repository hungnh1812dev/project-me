import { AUDIT_ACTIONS } from '../domain/SecurityAudit.constants';
import {
  type AuditWriter,
  PrismaAuditLogRepository,
  writeAuditLog,
} from './PrismaAuditLog.repository';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';

function capturingWriter() {
  const rows: unknown[] = [];
  const writer = {
    auditLog: {
      create: (args: { data: unknown }) => {
        rows.push(args.data);
        return Promise.resolve(args.data);
      },
    },
  } as unknown as AuditWriter;
  return { rows, writer };
}

describe('writeAuditLog (D15)', () => {
  it('maps the actor and defaults optional columns to null', async () => {
    const { rows, writer } = capturingWriter();
    await writeAuditLog(writer, {
      actor: { type: 'account', accountId: 7 },
      action: AUDIT_ACTIONS.ACCOUNT_DISABLED,
      subject: 'accounts',
      targetId: 'doc-1',
    });
    await writeAuditLog(writer, {
      actor: { type: 'system' },
      action: AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_OPERATOR,
    });
    expect(rows).toEqual([
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
    const { rows, writer } = capturingWriter();
    await writeAuditLog(writer, {
      actor: { type: 'api_token', accountId: 3, tokenId: 11 },
      action: AUDIT_ACTIONS.ROLE_UPDATED,
      metadata: { fields: ['name'] },
    });
    expect(rows[0]).toMatchObject({
      actorId: 3,
      actorType: 'api_token',
      metadata: { fields: ['name'], tokenId: 11 },
    });
  });
});

describe('PrismaAuditLogRepository', () => {
  it('writes a transaction-shaped caller with that transaction, never the client', async () => {
    const tx = capturingWriter();
    const client = capturingWriter();
    const repository = new PrismaAuditLogRepository(
      client.writer as unknown as PrismaService,
    );
    await repository.write(tx.writer, {
      actor: { type: 'system' },
      action: AUDIT_ACTIONS.ACCOUNT_SEEDED,
    });
    expect(tx.rows).toHaveLength(1);
    expect(client.rows).toHaveLength(0);
  });

  it('writeStandalone uses the client', async () => {
    const client = capturingWriter();
    const repository = new PrismaAuditLogRepository(
      client.writer as unknown as PrismaService,
    );
    await repository.writeStandalone({
      actor: { type: 'system' },
      action: AUDIT_ACTIONS.ACCOUNT_SEEDED,
    });
    expect(client.rows).toHaveLength(1);
  });
});
