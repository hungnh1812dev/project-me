import type { BaseQueryApi } from '@reduxjs/toolkit/query';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw/server';

import { ApiError } from './apiError';
import { axiosBaseQuery, toApiErrorData } from './axiosBaseQuery';

const api = { signal: new AbortController().signal } as BaseQueryApi;

describe('axiosBaseQuery', () => {
  it('returns { data } with the response body, sending method, body and params', async () => {
    let seen: { method: string; search: string; body: unknown } | undefined;
    server.use(
      http.post('*/api/v1/things', async ({ request }) => {
        seen = {
          method: request.method,
          search: new URL(request.url).search,
          body: await request.json(),
        };
        return HttpResponse.json({ id: 't1' });
      }),
    );

    const result = await axiosBaseQuery()(
      { url: '/things', method: 'POST', data: { name: 'a' }, params: { page: 2 } },
      api,
      {},
    );

    expect(result).toEqual({ data: { id: 't1' } });
    expect(seen).toEqual({ method: 'POST', search: '?page=2', body: { name: 'a' } });
  });

  it('returns { error } as a plain, serializable copy of the normalized ApiError', async () => {
    const body = { statusCode: 400, message: ['name is required', 'name too short'], error: 'Bad' };
    server.use(http.get('*/api/v1/things', () => HttpResponse.json(body, { status: 400 })));

    const result = await axiosBaseQuery()({ url: '/things' }, api, {});

    expect(result).toEqual({
      error: {
        status: 400,
        message: 'name is required, name too short',
        messages: ['name is required', 'name too short'],
        code: 'ERR_BAD_REQUEST',
        body,
      },
    });
    expect(Object.getPrototypeOf(result.error)).toBe(Object.prototype);
  });

  it('maps a network failure to status 0', async () => {
    server.use(http.get('*/api/v1/things', () => HttpResponse.error()));

    const result = await axiosBaseQuery()({ url: '/things' }, api, {});

    expect(result.error).toMatchObject({ status: 0, code: 'ERR_NETWORK' });
  });

  it('toApiErrorData keeps an ApiErrorData (what unwrap() rejects with) as is', () => {
    const data = { status: 403, message: 'Forbidden', messages: ['Forbidden'] };

    expect(toApiErrorData(data)).toBe(data);
  });

  it('toApiErrorData copies an ApiError into a plain object', () => {
    const copy = toApiErrorData(new ApiError({ status: 404, message: 'Not found' }));

    expect(copy).toEqual({ status: 404, message: 'Not found', messages: ['Not found'] });
    expect(copy).not.toBeInstanceOf(ApiError);
  });

  it('passes skipAuthRefresh through, so a 401 does not trigger a refresh', async () => {
    let refreshes = 0;
    server.use(
      http.get('*/api/v1/things', () => HttpResponse.json({ message: 'no' }, { status: 401 })),
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ message: 'ok', accessToken: 't' });
      }),
    );

    const result = await axiosBaseQuery()({ url: '/things', skipAuthRefresh: true }, api, {});

    expect(result.error).toMatchObject({ status: 401 });
    expect(refreshes).toBe(0);
  });
});
