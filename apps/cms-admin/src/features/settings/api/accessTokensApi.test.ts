import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeAccessToken } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  createAccessTokenHandler,
  deleteAccessTokenHandler,
  listAccessTokensHandler,
  revokeAccessTokenHandler,
  settingsErrorReply,
} from '@/test/msw/settingsHandlers';

import {
  createAccessToken,
  deleteAccessToken,
  getAccessTokens,
  revokeAccessToken,
} from './accessTokensApi';

describe('getAccessTokens (T1)', () => {
  it('GETs /access-tokens and resolves with the list', async () => {
    const t1 = listAccessTokensHandler();
    server.use(t1.handler);

    const tokens = await getAccessTokens();

    expect(tokens.map((token) => token.documentId)).toEqual(['tok-1', 'tok-2']);
    expect(t1.requests[0]?.url.pathname).toBe('/api/v1/access-tokens');
  });

  it('drops a secret the server should not have sent (AC-28)', async () => {
    server.use(
      listAccessTokensHandler(() =>
        HttpResponse.json([{ ...makeAccessToken(), token: 'cms_leaked' }]),
      ).handler,
    );

    const [token] = await getAccessTokens();

    expect(token).toEqual(makeAccessToken());
    expect(JSON.stringify(token)).not.toContain('cms_leaked');
  });
});

describe('createAccessToken (T2)', () => {
  const INPUT = { name: 'CI', permissions: ['document:read'], expiresIn: '1m' as const };

  it('POSTs /access-tokens with { name, permissions, expiresIn } and resolves with the secret', async () => {
    const t2 = createAccessTokenHandler();
    server.use(t2.handler);

    const created = await createAccessToken(INPUT);

    expect(created).toMatchObject({ documentId: 'tok-new', name: 'CI', token: 'cms_secret_1' });
    expect(t2.requests[0]).toMatchObject({ method: 'POST', body: INPUT });
    expect(t2.requests[0]?.url.pathname).toBe('/api/v1/access-tokens');
  });

  it('rejects a 400 as an ApiError', async () => {
    server.use(createAccessTokenHandler(settingsErrorReply(400, 'Unknown slug')).handler);

    const error = await createAccessToken(INPUT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: 'Unknown slug' });
  });
});

describe('revokeAccessToken (T3)', () => {
  it('POSTs /access-tokens/:id/revoke with {} (AC-31), encoding the id', async () => {
    const t3 = revokeAccessTokenHandler();
    server.use(t3.handler);

    const revoked = await revokeAccessToken('tok/1 x');

    expect(revoked.token).toBe('cms_secret_rotated');
    expect(t3.requests[0]).toMatchObject({ method: 'POST', body: {} });
    expect(t3.requests[0]?.url.pathname).toBe('/api/v1/access-tokens/tok%2F1%20x/revoke');
  });

  it('rejects a 404 as an ApiError', async () => {
    server.use(revokeAccessTokenHandler(settingsErrorReply(404, 'Not found')).handler);

    await expect(revokeAccessToken('tok-1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('deleteAccessToken (T4)', () => {
  it('DELETEs /access-tokens/:id, encoding the id', async () => {
    const t4 = deleteAccessTokenHandler();
    server.use(t4.handler);

    await expect(deleteAccessToken('tok/2')).resolves.toBeUndefined();
    expect(t4.requests[0]?.method).toBe('DELETE');
    expect(t4.requests[0]?.url.pathname).toBe('/api/v1/access-tokens/tok%2F2');
  });

  it('rejects a 404 as an ApiError', async () => {
    server.use(deleteAccessTokenHandler(settingsErrorReply(404, 'Not found')).handler);

    await expect(deleteAccessToken('tok-1')).rejects.toMatchObject({ status: 404 });
  });
});
