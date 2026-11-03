import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import { createMediaApi } from './Media.api';
import { MEDIA_UPLOAD_TIMEOUT_MS } from './Media.constants';

const file = new File(['x'], 'a.png', { type: 'image/png' });

/** Records the config each verb was called with. */
function recordingClient() {
  const configs: Record<string, AxiosRequestConfig | undefined> = {};
  const answer = (data: unknown) => Promise.resolve({ data });
  const client = {
    get: (_url: string, config?: AxiosRequestConfig) => {
      configs.get = config;
      return answer({ data: [], meta: {} });
    },
    post: (_url: string, _body: unknown, config?: AxiosRequestConfig) => {
      configs.post = config;
      return answer({});
    },
    put: (_url: string, _body: unknown, config?: AxiosRequestConfig) => {
      configs.put = config;
      return answer({});
    },
    patch: () => answer({}),
    delete: (_url: string, config?: AxiosRequestConfig) => {
      configs.delete = config;
      return answer({});
    },
  };
  return { configs, api: createMediaApi(client as unknown as AxiosInstance) };
}

describe('createMediaApi timeouts', () => {
  it('gives upload and replaceFile the upload timeout', async () => {
    const { api, configs } = recordingClient();
    await api.upload(file);
    await api.replaceFile('id-1', file);
    expect(configs.post?.timeout).toBe(MEDIA_UPLOAD_TIMEOUT_MS);
    expect(configs.put?.timeout).toBe(MEDIA_UPLOAD_TIMEOUT_MS);
  });

  it('leaves list and remove on the client default', async () => {
    const { api, configs } = recordingClient();
    await api.list({ page: 1, pageSize: 10, search: '', mimeType: '' });
    await api.remove('id-1');
    expect(configs.get).not.toHaveProperty('timeout');
    expect(configs.delete?.timeout).toBeUndefined();
  });
});
