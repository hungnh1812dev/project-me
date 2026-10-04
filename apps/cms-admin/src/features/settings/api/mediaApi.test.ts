import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { server } from '@/test/msw/server';
import {
  deleteMediaHandler,
  listMediaHandler,
  multipartFile,
  settingsErrorReply,
  uploadMediaHandler,
} from '@/test/msw/settingsHandlers';
import { uploadFile, useNodeFormData } from '@/test/nodeMultipart';

import { deleteMedia, getMedia, uploadMedia } from './mediaApi';

describe('getMedia (M1)', () => {
  it('GETs /media and resolves with the list, newest first', async () => {
    const m1 = listMediaHandler();
    server.use(m1.handler);

    const assets = await getMedia();

    expect(assets.map((asset) => asset.documentId)).toEqual(['media-2', 'media-1']);
    expect(m1.requests[0]?.url.pathname).toBe('/api/v1/media');
  });

  it('rejects with an ApiError on a 403', async () => {
    server.use(listMediaHandler(settingsErrorReply(403, 'Forbidden')).handler);

    await expect(getMedia()).rejects.toMatchObject({ status: 403 });
  });
});

describe('uploadMedia (M2)', () => {
  useNodeFormData();

  it('POSTs the file as multipart field "file" with a browser-set boundary', async () => {
    const m2 = uploadMediaHandler();
    server.use(m2.handler);
    const file = uploadFile('cat.png', 'image/png', 'png-bytes');

    const asset = await uploadMedia(file);

    expect(asset).toMatchObject({ documentId: 'media-new', fileName: 'cat.png' });
    const request = m2.requests[0];
    expect(request?.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(multipartFile(request?.body)).toEqual({ name: 'cat.png', type: 'image/png', size: 9 });
  });

  it.each([
    [413, 'Payload Too Large'],
    [422, 'Unsupported media type'],
    [400, 'File is required'],
  ])('rejects with an ApiError on a %d', async (status, message) => {
    server.use(uploadMediaHandler(settingsErrorReply(status, message)).handler);

    const error = await uploadMedia(uploadFile('a.png', 'image/png')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, message });
  });
});

describe('deleteMedia (M3)', () => {
  it('DELETEs /media/:id with the id encoded', async () => {
    const m3 = deleteMediaHandler();
    server.use(m3.handler);

    await deleteMedia('a/b c');

    expect(m3.requests[0]?.url.pathname).toBe('/api/v1/media/a%2Fb%20c');
  });

  it('rejects with an ApiError on a 404', async () => {
    server.use(deleteMediaHandler(settingsErrorReply(404, 'Not found')).handler);

    await expect(deleteMedia('gone')).rejects.toMatchObject({ status: 404 });
  });
});
