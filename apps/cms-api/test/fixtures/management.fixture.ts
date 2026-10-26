import type {
  TransactionRunner,
  UnitOfWork,
} from '../../src/infrastructure/database/TransactionRunner.port';
import { accountActor } from '../../src/modules/access/domain/ActorContext.entity';
import type { AccountActor } from '../../src/modules/access/domain/Rank.rules';
import type { AccountRecord } from '../../src/modules/access/management/domain/Account.entity';
import type { SystemRoleSlug } from '../../src/modules/access/domain/SystemRoles.entity';
import { systemRole } from './access.fixture';

export const ACTOR_ID = 1;

export function actorWithRole(slug: SystemRoleSlug): AccountActor {
  const actor = accountActor(ACTOR_ID, systemRole(slug));
  if (actor.kind !== 'account') throw new Error('expected an account actor');
  return actor;
}

/** A runner over one fake unit: `afterCommit` callbacks run only if the work resolves. */
export function fakeRunner(): {
  runner: TransactionRunner;
  unit: UnitOfWork;
  events: string[];
} {
  const events: string[] = [];
  const callbacks: (() => void)[] = [];
  const unit: UnitOfWork = { afterCommit: (cb) => callbacks.push(cb) };
  const runner: TransactionRunner = {
    run: async (work) => {
      callbacks.length = 0;
      const result = await work(unit);
      events.push('committed');
      callbacks.forEach((cb) => cb());
      return result;
    },
  };
  return { runner, unit, events };
}

export function accountRecord(
  overrides: Partial<AccountRecord> = {},
): AccountRecord {
  return {
    id: 20,
    documentId: '0195f3a0-0000-7000-8000-000000000020',
    email: 'target@example.test',
    displayName: 'Target',
    status: 'active',
    is2faEnabled: false,
    twoFaMethod: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    role: {
      id: 3,
      documentId: '0195f3a0-0000-7000-8000-000000000003',
      slug: 'guest',
      name: 'Guest',
      rank: 10,
      isSystem: true,
    },
    ...overrides,
  };
}
