import type { Clock } from '../../../common/time/clock';
import { type ActorContext, type RolePolicy } from '../../access';
import {
  PRESENCE_MAX_ENTRIES,
  PRESENCE_TTL_MS,
} from '../domain/Documents.constants';
import { PresenceService } from './Presence.service';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/Domain.errors';

const ROLE: RolePolicy = {
  id: 1,
  slug: 'editor',
  rank: 10,
  isSystem: false,
  policyVersion: 1,
  permissions: [],
};
const SLUG = 'article';
const DOC = 'doc-1';
const START = 1_000_000;

const account = (accountId: number): ActorContext => ({
  kind: 'account',
  accountId,
  role: ROLE,
});

let nowMs = START;
const clock: Clock = { now: () => nowMs };

/** Moves the fake clock, then sends the heartbeat. */
function beat(
  service: PresenceService,
  actor: ActorContext,
  documentId: string,
  at: number,
) {
  nowMs = at;
  return service.heartbeat(actor, SLUG, documentId, 'editing');
}

function build(): PresenceService {
  const access = {
    policy: () =>
      Promise.resolve({
        catalog: { isContentType: () => true },
        evaluator: { rowFilter: () => ({ allowed: true, where: null }) },
      }),
  };
  const registry = {
    registry: () =>
      Promise.resolve({
        resolve: () => ({
          root: { plan: { name: 'article' } },
          definition: { draftAndPublish: true },
        }),
      }),
  };
  const documents = { findVersion: () => Promise.resolve(1) };
  const accounts = {
    findByAccountId: (accountId: number) =>
      Promise.resolve({
        documentId: `00000000-0000-7000-8000-${String(accountId).padStart(12, '0')}`,
        displayName: `User ${accountId}`,
      }),
  };
  return new PresenceService(
    access as never,
    registry as never,
    documents as never,
    accounts,
    clock,
  );
}

const publicId = (id: number) =>
  `00000000-0000-7000-8000-${String(id).padStart(12, '0')}`;
const ids = (list: { accountId: string }[]) =>
  list.map((entry) => entry.accountId).sort();

describe('PresenceService', () => {
  it('lists an editor until the TTL passes without a heartbeat', async () => {
    const service = build();
    await beat(service, account(1), DOC, START);
    const during = await beat(
      service,
      account(2),
      DOC,
      START + PRESENCE_TTL_MS - 1,
    );
    expect(ids(during)).toEqual([publicId(1), publicId(2)]);
    const after = await beat(
      service,
      account(2),
      DOC,
      START + PRESENCE_TTL_MS + 1,
    );
    expect(ids(after)).toEqual([publicId(2)]);
  });

  it('a heartbeat extends the entry', async () => {
    const service = build();
    await beat(service, account(1), DOC, START);
    await beat(service, account(1), DOC, START + PRESENCE_TTL_MS - 1);
    const list = await beat(
      service,
      account(2),
      DOC,
      START + PRESENCE_TTL_MS + 5,
    );
    expect(ids(list)).toEqual([publicId(1), publicId(2)]);
    expect(list[0]?.displayName).toMatch(/^User /);
  });

  it('keeps documents apart', async () => {
    const service = build();
    await beat(service, account(1), 'a', START);
    const other = await beat(service, account(2), 'b', START);
    expect(other).toHaveLength(1);
  });

  it.each([
    ['reviewer', { kind: 'reviewer', accountId: 1, sessionId: 1, role: ROLE }],
    ['anonymous', { kind: 'anonymous', role: ROLE }],
    [
      'api_token',
      {
        kind: 'api_token',
        tokenId: 1,
        accountId: 1,
        role: ROLE,
        scope: { permissions: [] },
      },
    ],
  ] as const)('refuses a %s actor', async (_name, actor) => {
    await expect(
      beat(build(), actor as ActorContext, DOC, START),
    ).rejects.toMatchObject({ kind: DOMAIN_ERROR_KINDS.FORBIDDEN });
  });

  it('refuses new editors at the cap but still accepts expired-slot reuse', async () => {
    const service = build();
    for (let n = 0; n < PRESENCE_MAX_ENTRIES; n += 1) {
      await beat(service, account(n + 1), `d${n}`, START);
    }
    await expect(
      beat(service, account(1), 'overflow', START),
    ).rejects.toMatchObject({ kind: DOMAIN_ERROR_KINDS.RATE_LIMITED });
    const later = await beat(
      service,
      account(1),
      'overflow',
      START + PRESENCE_TTL_MS + 1,
    );
    expect(later).toHaveLength(1);
  });
});
