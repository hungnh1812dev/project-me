import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { handlers } from './handlers';
import { server } from './server';
import {
  createAccessTokenHandler,
  deleteMediaHandler,
  deletePermissionHandler,
  listAccessTokensHandler,
  listMediaHandler,
  listPermissionsHandler,
  listRolesHandler,
  listUsersHandler,
  multipartFile,
  revokeAccessTokenHandler,
  settingsErrorReply,
  updateUserRoleHandler,
  uploadMediaHandler,
} from './settingsHandlers';

const API = 'http://localhost/api/v1';

describe('settings MSW handlers', () => {
  it('are not part of the global default handlers', () => {
    const recorder = listUsersHandler();
    const defaultPaths = handlers.map((h) => String((h.info as { path?: unknown }).path));

    expect(handlers).not.toContain(recorder.handler);
    expect(
      defaultPaths.some((p) => /\/(users|roles|permissions|access-tokens|media)\b/.test(p)),
    ).toBe(false);
  });

  it.each([
    ['users', listUsersHandler, 'email'],
    ['roles', listRolesHandler, 'level'],
    ['permissions', listPermissionsHandler, 'slug'],
    ['access-tokens', listAccessTokensHandler, 'expiresAt'],
    ['media', listMediaHandler, 'thumbnailUrl'],
  ] as const)('GET /%s answers a fixture list by default', async (path, factory, field) => {
    const recorder = factory();
    server.use(recorder.handler);

    const res = await fetch(`${API}/${path}`);
    const body = (await res.json()) as Record<string, unknown>[];

    expect(res.status).toBe(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty(field);
    expect(recorder.requests).toHaveLength(1);
  });

  it('never lists an access-token secret', async () => {
    server.use(listAccessTokensHandler().handler);

    const body = (await (await fetch(`${API}/access-tokens`)).json()) as object[];

    for (const token of body) expect(token).not.toHaveProperty('token');
  });

  it('records the decoded path params and the JSON body', async () => {
    const recorder = updateUserRoleHandler();
    server.use(recorder.handler);

    const res = await fetch(`${API}/users/${encodeURIComponent('user 2')}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: 'role-admin' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ documentId: 'user 2', roleId: 'role-admin' });
    expect(recorder.requests[0]).toMatchObject({
      method: 'PATCH',
      params: { id: 'user 2' },
      body: { roleId: 'role-admin' },
    });
  });

  it('answers T2 and T3 with a one-time secret', async () => {
    server.use(createAccessTokenHandler().handler, revokeAccessTokenHandler().handler);

    const created = await fetch(`${API}/access-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CI', permissions: [], expiresIn: '1d' }),
    });
    const revoked = await fetch(`${API}/access-tokens/tok-1/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ name: 'CI', token: expect.any(String) });
    expect(await revoked.json()).toMatchObject({ documentId: 'tok-1', token: expect.any(String) });
  });

  it('records a multipart upload as raw text with a readable file part', async () => {
    const recorder = uploadMediaHandler();
    server.use(recorder.handler);
    // Hand-built: jsdom's FormData and File cannot cross MSW's Node interceptors and parser.
    const boundary = 'test-boundary';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="cat.png"',
      'Content-Type: image/png',
      '',
      'png-bytes',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const res = await fetch(`${API}/media/upload`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ fileName: 'cat.png', mimeType: 'image/png' });
    const recorded = recorder.requests[0];
    expect(recorded?.contentType).toMatch(/^multipart\/form-data/);
    expect(multipartFile(recorded?.body)).toEqual({ name: 'cat.png', type: 'image/png', size: 9 });
    expect(multipartFile(recorded?.body, 'other')).toBeNull();
    expect(multipartFile({ not: 'multipart' })).toBeNull();
  });

  it('answers deletes with 204 and accepts a custom reply', async () => {
    server.use(
      deleteMediaHandler().handler,
      deletePermissionHandler(() =>
        HttpResponse.json(
          { message: 'In use', roleCount: 2, accessTokenCount: 1 },
          { status: 409 },
        ),
      ).handler,
    );

    expect((await fetch(`${API}/media/m-1`, { method: 'DELETE' })).status).toBe(204);
    const conflict = await fetch(`${API}/permissions/p-1`, { method: 'DELETE' });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ message: 'In use', roleCount: 2, accessTokenCount: 1 });
  });

  it('builds Nest-style error replies', async () => {
    server.use(listRolesHandler(settingsErrorReply(403, 'Forbidden resource')).handler);

    const res = await fetch(`${API}/roles`);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden resource' });
  });
});
