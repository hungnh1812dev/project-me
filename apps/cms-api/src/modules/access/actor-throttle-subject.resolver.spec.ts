import type { Request } from 'express';

import { ActorThrottleSubjectResolver } from './actor-throttle-subject.resolver';

const ACCOUNT_ID = 42;

function requestWithActor(actor: unknown): Request {
  return { user: { actor } } as unknown as Request;
}

const resolver = new ActorThrottleSubjectResolver();

describe('ActorThrottleSubjectResolver', () => {
  const cases = [
    {
      label: 'account',
      req: requestWithActor({ kind: 'account', accountId: ACCOUNT_ID }),
      accountSubject: String(ACCOUNT_ID),
      isAnonymous: false,
    },
    {
      label: 'anonymous',
      req: requestWithActor({ kind: 'anonymous' }),
      accountSubject: undefined,
      isAnonymous: true,
    },
    {
      label: 'api token',
      req: requestWithActor({ kind: 'api-token', tokenId: 7 }),
      accountSubject: undefined,
      isAnonymous: false,
    },
    {
      label: 'reviewer',
      req: requestWithActor({ kind: 'reviewer', accountId: ACCOUNT_ID }),
      accountSubject: undefined,
      isAnonymous: false,
    },
    {
      label: 'no actor',
      req: {} as Request,
      accountSubject: undefined,
      isAnonymous: false,
    },
    {
      label: 'account without a numeric id',
      req: requestWithActor({ kind: 'account', accountId: '42' }),
      accountSubject: undefined,
      isAnonymous: false,
    },
  ];

  it.each(cases)(
    'resolves the subject for $label',
    ({ req, accountSubject, isAnonymous }) => {
      expect(resolver.accountSubjectOf(req)).toBe(accountSubject);
      expect(resolver.isAnonymousRequest(req)).toBe(isAnonymous);
    },
  );
});
