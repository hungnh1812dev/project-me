import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

import { API_PATHS, apiUrl } from './Api.endpoints';
import { CV_PAGE_SLUG, HTTP } from './E2e.constants';
import { bearer } from './Session.fixture';

export interface DraftRef {
  documentId: string;
  version: number;
}

export interface UploadedImage {
  id: string;
  fileName: string;
  url: string;
}

/** Keeps the access token the admin sends, so a spec needs no second login (5 per 15 minutes). */
export function watchAccessToken(page: Page): () => string {
  let token = '';
  page.on('request', (request) => {
    const header = request.headers()['authorization'];
    if (header?.startsWith('Bearer ')) token = header.slice('Bearer '.length);
  });
  return () => token;
}

export async function createCvPage(
  request: APIRequestContext,
  token: string,
  position: string,
): Promise<DraftRef> {
  const response = await request.post(apiUrl(API_PATHS.documents(CV_PAGE_SLUG)), {
    headers: bearer(token),
    data: { values: { position } },
  });
  expect(response.status()).toBe(HTTP.CREATED);
  return (await response.json()) as DraftRef;
}

export function putSummary(
  request: APIRequestContext,
  token: string,
  { documentId, version }: DraftRef,
  summary: string,
): Promise<APIResponse> {
  return request.put(apiUrl(API_PATHS.document(CV_PAGE_SLUG, documentId)), {
    headers: bearer(token),
    data: { version, values: { summary } },
  });
}

/** The stored draft: its version and the value of the summary field. */
export async function readDraft(
  request: APIRequestContext,
  token: string,
  documentId: string,
): Promise<{ version: number; summary: string }> {
  const response = await request.get(apiUrl(API_PATHS.document(CV_PAGE_SLUG, documentId)), {
    headers: bearer(token),
    params: { status: 'draft' },
  });
  expect(response.status()).toBe(HTTP.OK);
  const body = (await response.json()) as {
    version: number;
    values: { summary: string | null };
  };
  return { version: body.version, summary: body.values.summary ?? '' };
}

export async function removeCvPage(
  request: APIRequestContext,
  token: string,
  documentId: string,
): Promise<void> {
  const response = await request.delete(apiUrl(API_PATHS.document(CV_PAGE_SLUG, documentId)), {
    headers: bearer(token),
  });
  expect(response.status()).toBe(HTTP.NO_CONTENT);
}

export async function uploadImage(
  request: APIRequestContext,
  token: string,
  fileName: string,
  buffer: Buffer,
): Promise<UploadedImage> {
  const response = await request.post(apiUrl(API_PATHS.MEDIA), {
    headers: bearer(token),
    multipart: { file: { name: fileName, mimeType: 'image/png', buffer } },
  });
  expect(response.status()).toBe(HTTP.CREATED);
  return (await response.json()) as UploadedImage;
}
