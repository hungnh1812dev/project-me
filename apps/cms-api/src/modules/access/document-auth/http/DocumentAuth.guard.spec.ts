import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';

import type { JwtAuthGuard } from '../../../identity';
import type { AnonymousActorService } from '../../application/AnonymousActor.service';
import { API_TOKEN } from '../../domain/ApiToken.rules';
import type { ActorContext } from '../../domain/ActorContext.entity';
import type { ApiTokenAuthenticator } from '../../http/ApiToken.guard';
import { DocumentAuthGuard } from './DocumentAuth.guard';

const ANONYMOUS_ACTOR = { kind: 'anonymous' } as unknown as ActorContext;

type Route = 'anonymous' | 'api-token' | 'jwt';

const ROUTE_BY_HEADER: readonly {
  name: string;
  header: string | undefined;
  route: Route;
}[] = [
  { name: 'absent', header: undefined, route: 'anonymous' },
  {
    name: 'Bearer with the API token prefix',
    header: `Bearer ${API_TOKEN.PREFIX}abc`,
    route: 'api-token',
  },
  { name: 'other bearer', header: 'Bearer eyJhbGciOi.x.y', route: 'jwt' },
  { name: 'malformed bearer', header: 'Bearer', route: 'jwt' },
  { name: 'non-bearer scheme', header: 'Basic abc', route: 'jwt' },
];

function setup() {
  const calls: Route[] = [];
  const jwt = {
    canActivate: jest.fn(() => {
      calls.push('jwt');
      return true;
    }),
  };
  const tokens = {
    authenticate: jest.fn(() => {
      calls.push('api-token');
      return Promise.resolve();
    }),
  };
  const anonymous = {
    actor: jest.fn(() => {
      calls.push('anonymous');
      return Promise.resolve(ANONYMOUS_ACTOR);
    }),
  };
  const guard = new DocumentAuthGuard(
    jwt as unknown as JwtAuthGuard,
    tokens as unknown as ApiTokenAuthenticator,
    anonymous as unknown as AnonymousActorService,
  );
  const contextFor = (request: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;
  return { guard, calls, jwt, tokens, contextFor };
}

describe('DocumentAuthGuard', () => {
  it.each(ROUTE_BY_HEADER)(
    'authorization header $name goes to $route only',
    async ({ header, route }) => {
      const { guard, calls, contextFor } = setup();
      const request = { headers: { authorization: header } };

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

      expect(calls).toEqual([route]);
    },
  );

  it('leaves the anonymous actor on the request when no header is sent', async () => {
    const { guard, contextFor } = setup();
    const request: { headers: object; user?: unknown } = { headers: {} };

    await guard.canActivate(contextFor(request));

    expect(request.user).toEqual({ actor: ANONYMOUS_ACTOR });
  });

  it('a present but invalid API token is 401, never anonymous', async () => {
    const { guard, calls, tokens, contextFor } = setup();
    tokens.authenticate.mockRejectedValueOnce(new UnauthorizedException());
    const request = {
      headers: { authorization: `Bearer ${API_TOKEN.PREFIX}bad` },
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      UnauthorizedException,
    );

    expect(calls).not.toContain('anonymous');
  });

  it('a rejected JWT is 401, never anonymous', async () => {
    const { guard, calls, jwt, contextFor } = setup();
    jwt.canActivate.mockImplementationOnce(() => {
      throw new UnauthorizedException();
    });
    const request = { headers: { authorization: 'Bearer broken' } };

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      UnauthorizedException,
    );

    expect(calls).not.toContain('anonymous');
  });
});
