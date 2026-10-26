import type { AxiosInstance } from 'axios';

import { createReviewerApi } from './Reviewer.api';

describe('reviewer api', () => {
  it('reads the public switch', async () => {
    const get = vi
      .fn<AxiosInstance['get']>()
      .mockResolvedValue({ data: { enabled: true } });
    const client = { get } as unknown as AxiosInstance;
    expect(await createReviewerApi(client).isEnabled()).toBe(true);
    expect(get).toHaveBeenCalledWith('/reviewer/status');
  });

  it('posts the session request', async () => {
    const post = vi
      .fn<AxiosInstance['post']>()
      .mockResolvedValue({ data: { accessToken: 't', expiresAt: 'x' } });
    const client = { post } as unknown as AxiosInstance;
    const input = {
      visitorRole: 'Recruiter',
      purposeTags: [],
      turnstileToken: 'cf',
    };
    await createReviewerApi(client).createSession(input);
    expect(post).toHaveBeenCalledWith('/reviewer/sessions', input);
  });
});
