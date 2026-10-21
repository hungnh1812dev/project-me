import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import {
  customRole,
  grant,
  systemRole,
  testCatalog,
} from '../../../test/fixtures/access.fixture';
import { PermissionAction } from '../../generated/prisma/client';
import type { SystemRoleSlug } from '../identity/identity.constants';
import {
  PERMISSION_ACTIONS,
  SYSTEM_SUBJECT_ACTIONS,
  SYSTEM_SUBJECTS,
} from './access.constants';
import {
  type ActorContext,
  accountActor,
  anonymousActor,
  apiTokenActor,
  type RolePolicy,
  reviewerActor,
  type TokenScope,
} from './actor-context';
import { PolicyEvaluator, type RowFilter } from './policy-evaluator';

const { read, create, update, publish, unpublish } = PermissionAction;
const del = PermissionAction.delete;

const evaluator = new PolicyEvaluator(testCatalog());
const db = new Kysely<Record<string, Record<string, unknown>>>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

function whereSql(filter: RowFilter) {
  if (!filter.allowed || filter.where === null) return filter;
  return db.selectFrom('article').selectAll().where(filter.where).compile();
}

const account = (role: RolePolicy) => accountActor(1, role);
const CONTENT = 'article';
const UNKNOWN_SUBJECTS = [
  'unknown',
  '*',
  '',
  'Article',
  'article ',
  '__proto__',
];

/** Expected access per seeded role (decision T14). */
const MATRIX: Record<
  SystemRoleSlug,
  {
    content: readonly PermissionAction[];
    system: Partial<Record<string, readonly PermissionAction[]>>;
  }
> = {
  owner: { content: PERMISSION_ACTIONS, system: SYSTEM_SUBJECT_ACTIONS },
  admin: {
    content: PERMISSION_ACTIONS,
    system: {
      accounts: [read, create, update, del],
      roles: [read, create, update, del],
      api_tokens: [read, create, update, del],
      media: [read, create, update, del],
    },
  },
  editor: {
    content: [read, create, update, publish, unpublish],
    system: { media: [read, create, update] },
  },
  guest: { content: [], system: {} },
  reviewer: { content: [read], system: { media: [read] } },
  public: { content: [read], system: {} },
};

describe('PolicyEvaluator role matrix (seeded defaults)', () => {
  for (const [slug, expected] of Object.entries(MATRIX) as [
    SystemRoleSlug,
    (typeof MATRIX)[SystemRoleSlug],
  ][]) {
    describe(`role ${slug}`, () => {
      const actor = account(systemRole(slug));

      it.each(PERMISSION_ACTIONS)('content: %s', (action) => {
        expect(evaluator.can(actor, action, CONTENT)).toBe(
          expected.content.includes(action),
        );
        expect(evaluator.can(actor, action, 'note')).toBe(
          expected.content.includes(action),
        );
      });

      it.each(SYSTEM_SUBJECTS)('system subject %s', (subject) => {
        for (const action of PERMISSION_ACTIONS) {
          expect([
            subject,
            action,
            evaluator.can(actor, action, subject),
          ]).toEqual([
            subject,
            action,
            (expected.system[subject] ?? []).includes(action),
          ]);
        }
      });

      it('denies unknown subjects', () => {
        for (const subject of UNKNOWN_SUBJECTS) {
          for (const action of PERMISSION_ACTIONS) {
            expect(evaluator.can(actor, action, subject)).toBe(false);
          }
          expect(evaluator.fieldsFor(actor, subject).readable.paths).toEqual(
            [],
          );
        }
      });
    });
  }

  it('owner cannot do actions a system subject does not have', () => {
    const owner = account(systemRole('owner'));
    expect(evaluator.can(owner, del, 'audit_logs')).toBe(false);
    expect(evaluator.can(owner, publish, 'accounts')).toBe(false);
  });

  it('the owner short-circuit needs the system owner role, not just the slug', () => {
    const fake = { ...systemRole('owner'), isSystem: false };
    expect(evaluator.can(account(fake), read, CONTENT)).toBe(false);
  });

  it('a custom role gets exactly its rows', () => {
    const role = customRole(20, [grant('note', read), grant('media', read)]);
    const actor = account(role);
    expect(evaluator.can(actor, read, 'note')).toBe(true);
    expect(evaluator.can(actor, read, CONTENT)).toBe(false);
    expect(evaluator.can(actor, update, 'note')).toBe(false);
    expect(evaluator.can(actor, read, 'media')).toBe(true);
    expect(evaluator.can(actor, read, 'accounts')).toBe(false);
  });
});

describe('create rows with stored conditions (T21, fail closed)', () => {
  const conditions = {
    all: [{ field: 'priority', op: 'eq', value: 3 }],
  };

  it('grant nothing, whatever the rest of the row says', () => {
    const actor = account(
      customRole(20, [grant(CONTENT, create, { conditions })]),
    );
    expect(evaluator.can(actor, create, CONTENT)).toBe(false);
    expect(evaluator.rowFilter(actor, create, CONTENT)).toEqual({
      allowed: false,
    });
    expect(evaluator.fieldsFor(actor, CONTENT, create).writable.paths).toEqual(
      [],
    );
  });

  it('an unconditioned create row still grants', () => {
    const actor = account(
      customRole(20, [
        grant(CONTENT, create, { conditions }),
        grant(CONTENT, create),
      ]),
    );
    expect(evaluator.can(actor, create, CONTENT)).toBe(true);
  });

  it('read and update rows keep their conditions', () => {
    const actor = account(
      customRole(20, [
        grant(CONTENT, read, { conditions }),
        grant(CONTENT, update, { conditions }),
      ]),
    );
    expect(evaluator.can(actor, read, CONTENT)).toBe(true);
    expect(evaluator.can(actor, update, CONTENT)).toBe(true);
  });
});

describe('canReadDrafts (read + update)', () => {
  it.each<[SystemRoleSlug, boolean]>([
    ['owner', true],
    ['admin', true],
    ['editor', true],
    ['guest', false],
    ['reviewer', false],
    ['public', false],
  ])('%s -> %s', (slug, expected) => {
    expect(evaluator.canReadDrafts(account(systemRole(slug)), CONTENT)).toBe(
      expected,
    );
  });

  it('read alone is not enough', () => {
    const actor = account(customRole(20, [grant(CONTENT, read)]));
    expect(evaluator.canReadDrafts(actor, CONTENT)).toBe(false);
  });

  it('never for system subjects', () => {
    expect(evaluator.canReadDrafts(account(systemRole('owner')), 'media')).toBe(
      false,
    );
  });
});

describe('reviewer and anonymous actors', () => {
  // Even if the Owner gave the reviewer role write rows, D2 keeps it read-only.
  const generous = systemRole('reviewer', [
    grant('*', read),
    grant('*', update),
    grant('*', create),
    grant('media', del),
  ]);

  it.each<[string, ActorContext]>([
    ['reviewer', reviewerActor(5, 9, generous)],
    ['anonymous', anonymousActor({ ...generous, slug: 'public', rank: 0 })],
  ])('%s: read only, no drafts, nothing writable', (_label, actor) => {
    expect(evaluator.can(actor, read, CONTENT)).toBe(true);
    for (const action of [create, update, del, publish, unpublish]) {
      expect(evaluator.can(actor, action, CONTENT)).toBe(false);
    }
    expect(evaluator.can(actor, del, 'media')).toBe(false);
    expect(evaluator.canReadDrafts(actor, CONTENT)).toBe(false);
    const fields = evaluator.fieldsFor(actor, CONTENT);
    expect(fields.readable.all).toBe(true);
    expect(fields.writable.paths).toEqual([]);
  });
});

describe('fieldsFor', () => {
  it('owner and default roles: all fields', () => {
    for (const slug of ['owner', 'admin', 'editor'] as const) {
      const fields = evaluator.fieldsFor(account(systemRole(slug)), CONTENT);
      expect(fields.readable.all).toBe(true);
      expect(fields.writable.all).toBe(true);
    }
  });

  it('no permission: nothing readable or writable', () => {
    const fields = evaluator.fieldsFor(account(systemRole('guest')), CONTENT);
    expect(fields.readable.paths).toEqual([]);
    expect(fields.writable.paths).toEqual([]);
  });

  it('a slug row overrides the * row for the same action', () => {
    const role = customRole(25, [
      grant('*', read),
      grant(CONTENT, read, { readableFields: ['title', 'reference.name'] }),
      grant('*', update, { writableFields: null }),
    ]);
    const fields = evaluator.fieldsFor(account(role), CONTENT);
    expect(fields.readable.allows('title')).toBe(true);
    expect(fields.readable.allows('reference.name')).toBe(true);
    expect(fields.readable.allows('reference.phone')).toBe(false);
    expect(fields.readable.allows('body')).toBe(false);
    expect(fields.writable.all).toBe(true);
    // Other content types still get the * row.
    expect(evaluator.fieldsFor(account(role), 'note').readable.all).toBe(true);
  });

  it('rows at the same level add up; a component path covers its subtree', () => {
    const role = customRole(25, [
      grant(CONTENT, read, { readableFields: ['title'] }),
      grant(CONTENT, read, { readableFields: ['reference'] }),
      grant(CONTENT, create, { writableFields: ['title'] }),
    ]);
    const fields = evaluator.fieldsFor(account(role), CONTENT, create);
    expect(fields.readable.allows('reference.phone')).toBe(true);
    expect(fields.readable.allows('body')).toBe(false);
    expect(fields.writable.paths).toEqual(['title']);
    expect(evaluator.fieldsFor(account(role), CONTENT).writable.paths).toEqual(
      [],
    );
  });
});

describe('API tokens (scope ∩ creator current permissions, D5)', () => {
  const scope = (permissions: TokenScope['permissions']): TokenScope => ({
    permissions,
  });
  const token = (creator: RolePolicy, tokenScope: TokenScope) =>
    apiTokenActor(3, 1, creator, tokenScope);

  it('gets only what both the scope and the creator allow', () => {
    const actor = token(
      systemRole('editor'),
      scope([
        { subject: '*', action: read },
        { subject: CONTENT, action: del },
        { subject: CONTENT, action: update },
      ]),
    );
    expect(evaluator.can(actor, read, CONTENT)).toBe(true);
    expect(evaluator.can(actor, update, CONTENT)).toBe(true);
    expect(evaluator.can(actor, update, 'note')).toBe(false);
    // In scope, but the editor creator cannot delete.
    expect(evaluator.can(actor, del, CONTENT)).toBe(false);
    expect(evaluator.can(actor, publish, CONTENT)).toBe(false);
  });

  it('follows the creator’s current permissions (§12-6)', () => {
    const tokenScope = scope([{ subject: CONTENT, action: del }]);
    expect(
      evaluator.can(token(systemRole('admin'), tokenScope), del, CONTENT),
    ).toBe(true);
    const demoted = systemRole(
      'admin',
      systemRole('admin').permissions.filter((g) => g.action !== del),
    );
    expect(evaluator.can(token(demoted, tokenScope), del, CONTENT)).toBe(false);
  });

  it('never reaches system subjects, even for the owner', () => {
    const actor = token(
      systemRole('owner'),
      scope([
        { subject: 'accounts', action: read },
        { subject: '*', action: read },
      ]),
    );
    expect(evaluator.can(actor, read, 'accounts')).toBe(false);
    expect(evaluator.can(actor, read, CONTENT)).toBe(true);
    expect(evaluator.can(actor, update, CONTENT)).toBe(false);
  });

  it('intersects field lists and keeps the creator override', () => {
    const creator = customRole(30, [
      grant('*', read),
      grant(CONTENT, read, { readableFields: ['title', 'reference'] }),
      grant(CONTENT, update, { writableFields: ['title', 'body'] }),
    ]);
    const actor = token(
      creator,
      scope([
        { subject: '*', action: read, readableFields: null },
        {
          subject: CONTENT,
          action: update,
          writableFields: ['body', 'priority'],
        },
      ]),
    );
    const fields = evaluator.fieldsFor(actor, CONTENT);
    expect(fields.readable.allows('reference.phone')).toBe(true);
    expect(fields.readable.allows('body')).toBe(false);
    expect(fields.writable.paths).toEqual(['body']);
    expect(evaluator.fieldsFor(actor, 'note').readable.all).toBe(true);
  });

  it('keeps the creator’s conditions', () => {
    const creator = customRole(30, [
      grant(CONTENT, update, {
        conditions: {
          all: [{ field: 'createdBy', op: 'eq', value: '$actor.id' }],
        },
      }),
    ]);
    const actor = apiTokenActor(
      3,
      42,
      creator,
      scope([{ subject: CONTENT, action: update }]),
    );
    const compiled = whereSql(evaluator.rowFilter(actor, update, CONTENT));
    expect(compiled).toMatchObject({ parameters: [42] });
  });
});

describe('rowFilter', () => {
  const own = { all: [{ field: 'createdBy', op: 'eq', value: '$actor.id' }] };

  it('denies without permission and is unrestricted without conditions', () => {
    expect(
      evaluator.rowFilter(account(systemRole('guest')), read, CONTENT),
    ).toEqual({ allowed: false });
    expect(
      evaluator.rowFilter(account(systemRole('editor')), read, CONTENT),
    ).toEqual({
      allowed: true,
      where: null,
    });
    expect(
      evaluator.rowFilter(account(systemRole('owner')), del, CONTENT),
    ).toEqual({
      allowed: true,
      where: null,
    });
  });

  it('ORs the conditions of several rows', () => {
    const role = customRole(30, [
      grant(CONTENT, update, { conditions: own }),
      grant(CONTENT, update, {
        conditions: { all: [{ field: 'priority', op: 'in', value: [1, 2] }] },
      }),
    ]);
    const compiled = whereSql(
      evaluator.rowFilter(accountActor(9, role), update, CONTENT),
    );
    expect(compiled).toMatchObject({
      sql: 'select * from "article" where (("created_by" = $1) or ("priority" in ($2, $3)))',
      parameters: [9, 1, 2],
    });
  });

  it('an unconditional row wins over conditional ones', () => {
    const role = customRole(30, [
      grant(CONTENT, update, { conditions: own }),
      grant(CONTENT, update),
    ]);
    expect(evaluator.rowFilter(account(role), update, CONTENT)).toEqual({
      allowed: true,
      where: null,
    });
  });

  it('a stored condition that no longer validates grants nothing (fails closed)', () => {
    const role = customRole(30, [
      grant(CONTENT, update, {
        conditions: { all: [{ field: 'removedField', op: 'eq', value: 'x' }] },
      }),
    ]);
    expect(evaluator.rowFilter(account(role), update, CONTENT)).toEqual({
      allowed: false,
    });
  });

  it('anonymous actors have no id, so $actor.id matches nothing', () => {
    const role = systemRole('public', [
      grant(CONTENT, read, { conditions: own }),
    ]);
    const compiled = whereSql(
      evaluator.rowFilter(anonymousActor(role), read, CONTENT),
    );
    // `= NULL` (never true), not `IS NULL` (rows nobody created).
    expect(compiled).toMatchObject({
      sql: 'select * from "article" where (("created_by" = $1))',
      parameters: [null],
    });
  });
});
