import { DomainError } from '../../../common/errors/Domain.errors';

import {
  customRole,
  grant,
  systemRole,
  testCatalog,
} from '../../../../test/fixtures/access.fixture';
import { PermissionAction } from '../../../generated/prisma/client';
import {
  accountActor,
  anonymousActor,
  apiTokenActor,
} from './ActorContext.entity';
import { PolicyEvaluator } from './PolicyEvaluator';
import {
  assertOutranks,
  grantsBeyondActor,
  outranks,
  requireAccountActor,
} from './Rank.rules';

const { read, update } = PermissionAction;
const catalog = testCatalog();
const evaluator = new PolicyEvaluator(catalog);
const owner = accountActor(1, systemRole('owner'));
const admin = accountActor(2, systemRole('admin'));

describe('D6 rank rule (§12-7)', () => {
  it('allows only targets strictly below the actor', () => {
    expect(outranks(admin, 39)).toBe(true);
    expect(outranks(admin, 40)).toBe(false);
    expect(outranks(admin, 100)).toBe(false);
    expect(outranks(owner, 40)).toBe(true);
    // Nobody outranks the owner, so `owner` can never be assigned.
    expect(outranks(owner, 100)).toBe(false);
  });

  it('assertOutranks checks every rank and throws 403', () => {
    expect(() => assertOutranks(admin, 30, 11)).not.toThrow();
    expect(() => assertOutranks(admin, 30, 40)).toThrow(DomainError);
  });

  it('only signed-in accounts manage accounts and roles', () => {
    expect(requireAccountActor(admin)).toBe(admin);
    const token = apiTokenActor(9, 1, systemRole('owner'), { permissions: [] });
    expect(() => requireAccountActor(token)).toThrow(DomainError);
    expect(() =>
      requireAccountActor(anonymousActor(systemRole('public'))),
    ).toThrow(DomainError);
  });
});

describe('grantsBeyondActor', () => {
  const grants = [
    grant('article', read),
    grant('audit_logs', read),
    grant('accounts', update),
    grant('reviewer_settings', update),
  ];

  it('flags system subject actions the admin lacks (audit_logs, reviewer_settings)', () => {
    expect(grantsBeyondActor(admin, grants, catalog, evaluator)).toEqual([
      1, 3,
    ]);
  });

  it('lets the owner grant anything', () => {
    expect(grantsBeyondActor(owner, grants, catalog, evaluator)).toEqual([]);
  });

  it('bounds a custom manager by its own system rows', () => {
    const manager = accountActor(
      3,
      customRole(39, [grant('roles', read), grant('roles', update)]),
    );
    expect(
      grantsBeyondActor(
        manager,
        [grant('roles', read), grant('accounts', read)],
        catalog,
        evaluator,
      ),
    ).toEqual([1]);
  });
});
