import axios from 'axios';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw/server';

describe('test environment', () => {
  it('runs in jsdom with jest-dom matchers', () => {
    document.body.innerHTML = '<p>hello</p>';

    expect(document.querySelector('p')).toBeInTheDocument();
  });

  it('lets MSW intercept an axios request', async () => {
    server.use(http.get('http://localhost/api/v1/ping', () => HttpResponse.json({ pong: true })));

    const res = await axios.get('http://localhost/api/v1/ping');

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ pong: true });
  });

  it('fails requests that no handler matches', async () => {
    await expect(axios.get('http://localhost/api/v1/unhandled')).rejects.toThrow();
  });
});
