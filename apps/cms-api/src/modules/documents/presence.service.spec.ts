import { ForbiddenException } from '@nestjs/common';

import { type ActorContext, type RolePolicy } from '../access';
import {
  PRESENCE_MAX_ENTRIES,
  PRESENCE_TTL_MS,
} from './domain/Documents.constants';
import { PresenceService } from './presence.service';

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
  const query = { executeTakeFirst: () => Promise.resolve({ id: 1 }) };
  const chain: Record<string, unknown> = {};
  for (const name of ['withSchema', 'selectFrom', 'select', 'where']) {
    chain[name] = () => chain;
  }
  chain.executeTakeFirst = query.executeTakeFirst;
  const prisma = {
    account: {
      findUnique: ({ where }: { where: { id: number } }) =>
        Promise.resolve({
          documentId: `00000000-0000-7000-8000-${String(where.id).padStart(12, '0')}`,
          displayName: `User ${where.id}`,
        }),
    },
  };
  return new PresenceService(
    access as never,
    registry as never,
    { db: chain } as never,
    prisma as never,
  );
}

const publicId = (id: number) =>
  `00000000-0000-7000-8000-${String(id).padStart(12, '0')}`;
const ids = (list: { accountId: string }[]) =>
  list.map((entry) => entry.accountId).sort();

describe('PresenceService', () => {
  it('lists an editor until the TTL passes without a heartbeat', async () => {
    const service = build();
    await service.heartbeat(account(1), SLUG, DOC, 'editing', START);
    const during = await service.heartbeat(
      account(2),
      SLUG,
      DOC,
      'editing',
      START + PRESENCE_TTL_MS - 1,
    );
    expect(ids(during)).toEqual([publicId(1), publicId(2)]);
    const after = await service.heartbeat(
      account(2),
      SLUG,
      DOC,
      'editing',
      START + PRESENCE_TTL_MS + 1,
    );
    expect(ids(after)).toEqual([publicId(2)]);
  });

  it('a heartbeat extends the entry', async () => {
    const service = build();
    await service.heartbeat(account(1), SLUG, DOC, 'editing', START);
    await service.heartbeat(
      account(1),
      SLUG,
      DOC,
      'editing',
      START + PRESENCE_TTL_MS - 1,
    );
    const list = await service.heartbeat(
      account(2),
      SLUG,
      DOC,
      'editing',
      START + PRESENCE_TTL_MS + 5,
    );
    expect(ids(list)).toEqual([publicId(1), publicId(2)]);
    expect(list[0]?.displayName).toMatch(/^User /);
  });

  it('keeps documents apart', async () => {
    const service = build();
    await service.heartbeat(account(1), SLUG, 'a', 'editing', START);
    const other = await service.heartbeat(
      account(2),
      SLUG,
      'b',
      'editing',
      START,
    );
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
      build().heartbeat(actor as ActorContext, SLUG, DOC, 'editing', START),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses new editors at the cap but still accepts expired-slot reuse', async () => {
    const service = build();
    for (let n = 0; n < PRESENCE_MAX_ENTRIES; n += 1) {
      await service.heartbeat(account(n + 1), SLUG, `d${n}`, 'editing', START);
    }
    await expect(
      service.heartbeat(account(1), SLUG, 'overflow', 'editing', START),
    ).rejects.toMatchObject({ status: 429 });
    const later = await service.heartbeat(
      account(1),
      SLUG,
      'overflow',
      'editing',
      START + PRESENCE_TTL_MS + 1,
    );
    expect(later).toHaveLength(1);
  });
});
