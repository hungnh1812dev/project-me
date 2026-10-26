import { systemRole } from '../../../../test/fixtures/access.fixture';
import { accountActor, anonymousActor, apiTokenActor } from '../../access';
import { auditActorOf } from './AuditActor.rules';

describe('auditActorOf', () => {
  it('maps every actor kind', () => {
    const role = systemRole('admin');
    expect(auditActorOf(accountActor(5, role))).toEqual({
      type: 'account',
      accountId: 5,
    });
    expect(
      auditActorOf(apiTokenActor(9, 5, role, { permissions: [] })),
    ).toEqual({ type: 'api_token', accountId: 5, tokenId: 9 });
    expect(auditActorOf(anonymousActor(systemRole('public')))).toEqual({
      type: 'account',
      accountId: null,
    });
  });
});
