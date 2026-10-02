import { act, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeMediaAsset, makeMeUser, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  deleteMediaHandler,
  listMediaHandler,
  multipartFile,
  settingsErrorReply,
  uploadMediaHandler,
  type SettingsRequest,
} from '@/test/msw/settingsHandlers';
import { uploadFile, useNodeFormData } from '@/test/nodeMultipart';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { settingsKeys } from '../queryKeys';
import { useDeleteMedia, useMediaList, useUploadMedia } from './useMedia';

function signedIn(permissions: string[]) {
  return {
    auth: {
      status: 'authenticated' as const,
      user: makeMeUser({ role: makeRole({ permissions, level: 100 }) }),
    },
  };
}

const MANAGER = signedIn(['media:read', 'media:manager']);
const READER = signedIn(['media:read']);
const STALE = [makeMediaAsset({ documentId: 'stale' })];
const DENIED = 'Requires the "media:manager" permission.';

/** Replies per file name: `big.png` → 413, `odd.png` → 422, anything else → 201. */
function byFileName({ body }: SettingsRequest) {
  const name = multipartFile(body)?.name ?? '';
  if (name === 'big.png') return settingsErrorReply(413, 'Payload Too Large')({} as never);
  if (name === 'odd.png') return settingsErrorReply(422, 'Unprocessable Entity')({} as never);
  return HttpResponse.json(makeMediaAsset({ documentId: `id-${name}`, fileName: name }), {
    status: 201,
  });
}

describe('useMediaList (M1)', () => {
  it('loads the list with media:read', async () => {
    server.use(listMediaHandler().handler);
    const { result } = renderHookWithProviders(() => useMediaList(), READER);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((asset) => asset.fileName)).toEqual(['dog.jpg', 'cat.png']);
  });

  it('sends no request without media:read and says why', () => {
    const m1 = listMediaHandler();
    server.use(m1.handler);
    const { result } = renderHookWithProviders(() => useMediaList(), signedIn([]));

    expect(result.current.decision.allowed).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
    expect(m1.requests).toHaveLength(0);
  });
});

describe('useUploadMedia (M2, AC-6, AC-11, AC-36, AC-37)', () => {
  useNodeFormData();

  it('uploads accepted files one at a time and invalidates media once at the end', async () => {
    const m2 = uploadMediaHandler(byFileName);
    server.use(m2.handler);
    const { result, queryClient } = renderHookWithProviders(() => useUploadMedia(), MANAGER);
    queryClient.setQueryData(settingsKeys.media(), STALE);

    const summary = await act(() =>
      result.current.upload([uploadFile('a.png', 'image/png'), uploadFile('b.jpg', 'image/jpeg')]),
    );

    expect(summary).toEqual({ uploaded: 2, total: 2 });
    expect(m2.requests.map((request) => multipartFile(request.body)?.name)).toEqual([
      'a.png',
      'b.jpg',
    ]);
    expect(result.current.items.map(({ name, status }) => [name, status])).toEqual([
      ['a.png', 'uploaded'],
      ['b.jpg', 'uploaded'],
    ]);
    expect(queryClient.getQueryState(settingsKeys.media())?.isInvalidated).toBe(true);
  });

  it('never has two uploads in flight', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    server.use(
      uploadMediaHandler(async (request) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return byFileName(request);
      }).handler,
    );
    const { result } = renderHookWithProviders(() => useUploadMedia(), MANAGER);

    await act(() =>
      result.current.upload(['1.png', '2.png', '3.png'].map((n) => uploadFile(n, 'image/png'))),
    );

    expect(maxInFlight).toBe(1);
  });

  it('marks the file being sent as uploading and the rest as waiting', async () => {
    const gates: (() => void)[] = [];
    server.use(
      uploadMediaHandler(async (request) => {
        await new Promise<void>((resolve) => gates.push(resolve));
        return byFileName(request);
      }).handler,
    );
    const { result } = renderHookWithProviders(() => useUploadMedia(), MANAGER);

    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = result.current.upload([
        uploadFile('a.png', 'image/png'),
        uploadFile('b.png', 'image/png'),
      ]);
    });

    await waitFor(() => expect(gates).toHaveLength(1));
    expect(result.current.items.map((item) => item.status)).toEqual(['uploading', 'waiting']);
    expect(result.current.isUploading).toBe(true);
    act(() => gates[0]?.());
    await waitFor(() => expect(gates).toHaveLength(2));
    expect(result.current.items.map((item) => item.status)).toEqual(['uploaded', 'uploading']);
    await act(async () => {
      gates[1]?.();
      await done;
    });
    expect(result.current.isUploading).toBe(false);
  });

  it('keeps going after a failure and gives each failure its reason', async () => {
    const m2 = uploadMediaHandler(byFileName);
    server.use(m2.handler);
    const { result } = renderHookWithProviders(() => useUploadMedia(), MANAGER);

    const summary = await act(() =>
      result.current.upload([
        uploadFile('big.png', 'image/png'),
        uploadFile('odd.png', 'image/png'),
        uploadFile('ok.png', 'image/png'),
      ]),
    );

    expect(summary).toEqual({ uploaded: 1, total: 3 });
    expect(result.current.items.map(({ status, error }) => [status, error])).toEqual([
      ['failed', 'File is too large.'],
      ['failed', 'Unsupported file type.'],
      ['uploaded', undefined],
    ]);
  });

  it('shows the server message for a 400', async () => {
    server.use(uploadMediaHandler(settingsErrorReply(400, 'File is required')).handler);
    const { result } = renderHookWithProviders(() => useUploadMedia(), MANAGER);

    await act(() => result.current.upload([uploadFile('a.png', 'image/png')]));

    expect(result.current.items[0]).toMatchObject({ status: 'failed', error: 'File is required' });
  });

  it('rejects non-PNG/JPEG files before sending them and counts them in the total', async () => {
    const m2 = uploadMediaHandler(byFileName);
    server.use(m2.handler);
    const { result } = renderHookWithProviders(() => useUploadMedia(), MANAGER);

    const summary = await act(() =>
      result.current.upload([
        uploadFile('anim.gif', 'image/gif'),
        uploadFile('a.png', 'image/png'),
      ]),
    );

    expect(summary).toEqual({ uploaded: 1, total: 2 });
    expect(m2.requests).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      name: 'anim.gif',
      status: 'failed',
      error: 'anim.gif: only PNG and JPEG images are supported.',
    });
  });

  it('leaves the cache alone when nothing uploaded', async () => {
    server.use(uploadMediaHandler(settingsErrorReply(413)).handler);
    const { result, queryClient } = renderHookWithProviders(() => useUploadMedia(), MANAGER);
    queryClient.setQueryData(settingsKeys.media(), STALE);

    const summary = await act(() => result.current.upload([uploadFile('a.png', 'image/png')]));

    expect(summary).toEqual({ uploaded: 0, total: 1 });
    expect(queryClient.getQueryState(settingsKeys.media())?.isInvalidated).toBe(false);
  });

  it('rejects before any request without media:manager', async () => {
    const m2 = uploadMediaHandler(byFileName);
    server.use(m2.handler);
    const { result, queryClient } = renderHookWithProviders(() => useUploadMedia(), READER);
    queryClient.setQueryData(settingsKeys.media(), STALE);

    const error = await result.current
      .upload([uploadFile('a.png', 'image/png')])
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'ERR_CLIENT_FORBIDDEN', message: DENIED });
    expect(m2.requests).toHaveLength(0);
    expect(result.current.items).toEqual([]);
    expect(queryClient.getQueryState(settingsKeys.media())?.isInvalidated).toBe(false);
  });

  it('ignores a second batch while one is running', async () => {
    let release: () => void = () => {};
    const m2 = uploadMediaHandler(async (request) => {
      await new Promise<void>((resolve) => (release = resolve));
      return byFileName(request);
    });
    server.use(m2.handler);
    const { result } = renderHookWithProviders(() => useUploadMedia(), MANAGER);

    let first: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.upload([uploadFile('a.png', 'image/png')]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(true));
    const second = await act(() => result.current.upload([uploadFile('b.png', 'image/png')]));
    await act(async () => {
      release();
      await first;
    });

    expect(second).toBeNull();
    expect(m2.requests.map((request) => multipartFile(request.body)?.name)).toEqual(['a.png']);
  });
});

describe('useDeleteMedia (M3, AC-6, AC-11)', () => {
  it('sends M3 and invalidates media', async () => {
    const m3 = deleteMediaHandler();
    server.use(m3.handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeleteMedia(), MANAGER);
    queryClient.setQueryData(settingsKeys.media(), STALE);

    await act(() => result.current.mutateAsync('media-1'));

    expect(m3.requests[0]?.params.id).toBe('media-1');
    expect(queryClient.getQueryState(settingsKeys.media())?.isInvalidated).toBe(true);
  });

  it('rejects before any request without media:manager', async () => {
    const m3 = deleteMediaHandler();
    server.use(m3.handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeleteMedia(), READER);
    queryClient.setQueryData(settingsKeys.media(), STALE);

    await expect(result.current.mutateAsync('media-1')).rejects.toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
    });
    expect(m3.requests).toHaveLength(0);
    expect(queryClient.getQueryState(settingsKeys.media())?.isInvalidated).toBe(false);
  });

  it('leaves the cache unchanged on a server 404', async () => {
    server.use(deleteMediaHandler(settingsErrorReply(404, 'Not found')).handler);
    const { result, queryClient } = renderHookWithProviders(() => useDeleteMedia(), MANAGER);
    queryClient.setQueryData(settingsKeys.media(), STALE);

    await expect(result.current.mutateAsync('media-1')).rejects.toMatchObject({ status: 404 });
    expect(queryClient.getQueryState(settingsKeys.media())?.isInvalidated).toBe(false);
  });
});
