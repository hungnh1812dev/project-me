import { AxiosError, type AxiosInstance } from 'axios';

import { createReviewerApi } from './Reviewer.api';

function failureOf(status: number, data: unknown): AxiosError {
  return new AxiosError('failed', undefined, undefined, undefined, {
    status,
    data,
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

describe('reviewer api', () => {
  it('reads the public switch', async () => {
    const get = vi
      .fn<AxiosInstance['get']>()
      .mockResolvedValue({ data: { enabled: true } });
    const client = { get } as unknown as AxiosInstance;
    expect(await createReviewerApi(client).isEnabled()).toBe(true);
    expect(get).toHaveBeenCalledWith('/reviewer/status');
  });

  it('reads REVIEWER_FEATURE_OFF as not enabled', async () => {
    const get = vi
      .fn<AxiosInstance['get']>()
      .mockRejectedValue(failureOf(404, { errorCode: 'REVIEWER_FEATURE_OFF' }));
    const client = { get } as unknown as AxiosInstance;
    expect(await createReviewerApi(client).isEnabled()).toBe(false);
  });

  it.each([
    [404, { errorCode: 'NOT_FOUND' }],
    [500, { errorCode: 'REVIEWER_FEATURE_OFF' }],
    [503, {}],
  ])('still throws on status %s with %j', async (status, body) => {
    const get = vi
      .fn<AxiosInstance['get']>()
      .mockRejectedValue(failureOf(status, body));
    const client = { get } as unknown as AxiosInstance;
    await expect(createReviewerApi(client).isEnabled()).rejects.toBeInstanceOf(
      AxiosError,
    );
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
