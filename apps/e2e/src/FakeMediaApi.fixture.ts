import type { BrowserContext, Route } from '@playwright/test';

import { API_ERROR_CODES } from './AppContracts.contract';
import { HTTP } from './E2e.constants';

/** A 1x1 transparent PNG. */
export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const MEDIA_API_PATTERN = /\/api\/v1\/media(\/[0-9a-f-]+)?(\?.*)?$/;
const ALLOWED_TYPES = ['image/png', 'application/pdf', 'video/mp4'];
const FAKE_FILE_URL = `data:image/png;base64,${PNG_BASE64}`;
const FAKE_BYTES = 68;
const FAKE_PAGE_SIZE = 20;

interface FakeFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  url: string;
  thumbnailUrl: string | null;
  isReviewerPreset: boolean;
  createdAt: string;
}

function corsHeaders(route: Route): Record<string, string> {
  const request = route.request();
  return {
    'access-control-allow-origin': request.headers()['origin'] ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers':
      request.headers()['access-control-request-headers'] ?? '*',
  };
}

const respondJson = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  });

const respondError = (route: Route, status: number, errorCode: string) =>
  respondJson(route, status, {
    statusCode: status,
    errorCode,
    message: errorCode,
  });

function newFakeFile(name: string, mimeType: string): FakeFile {
  return {
    id: crypto.randomUUID(),
    fileName: name,
    mimeType,
    size: FAKE_BYTES,
    width: 1,
    height: 1,
    alt: null,
    url: FAKE_FILE_URL,
    thumbnailUrl: null,
    isReviewerPreset: false,
    createdAt: new Date().toISOString(),
  };
}

function uploadedPart(route: Route): { name: string; type: string } {
  const raw = route.request().postData() ?? '';
  return {
    name: /filename="([^"]+)"/.exec(raw)?.[1] ?? 'file',
    type: /Content-Type: ([^\r\n]+)/i.exec(raw)?.[1] ?? '',
  };
}

/**
 * The smoke stack runs production mode with dummy Cloudinary credentials, so
 * real uploads cannot succeed there. The library is driven against an
 * in-memory stand-in for /media; the real API contract is covered by cms-api's
 * integration tests. Files named in `inUse` refuse deletion.
 */
export async function fakeMediaApi(
  context: BrowserContext,
  inUse: Set<string>,
): Promise<void> {
  const files: FakeFile[] = [];

  const list = (route: Route) =>
    respondJson(route, HTTP.OK, {
      data: files,
      meta: { page: 1, pageSize: FAKE_PAGE_SIZE, total: files.length },
    });

  const upload = (route: Route) => {
    const { name, type } = uploadedPart(route);
    if (!ALLOWED_TYPES.includes(type)) {
      return respondError(
        route,
        HTTP.UNSUPPORTED_MEDIA_TYPE,
        API_ERROR_CODES.MEDIA_UNSUPPORTED_TYPE,
      );
    }
    const created = newFakeFile(name, type);
    files.unshift(created);
    return respondJson(route, HTTP.CREATED, created);
  };

  const update = (route: Route, found: FakeFile) => {
    const body = route.request().postDataJSON() as { alt: string | null };
    found.alt = body.alt;
    return respondJson(route, HTTP.OK, found);
  };

  const remove = (route: Route, found: FakeFile) => {
    if (inUse.has(found.fileName)) {
      return respondError(route, HTTP.CONFLICT, API_ERROR_CODES.MEDIA_IN_USE);
    }
    files.splice(files.indexOf(found), 1);
    return route.fulfill({
      status: HTTP.NO_CONTENT,
      headers: corsHeaders(route),
    });
  };

  await context.route(MEDIA_API_PATTERN, (route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'OPTIONS') {
      return route.fulfill({
        status: HTTP.NO_CONTENT,
        headers: corsHeaders(route),
      });
    }
    if (method === 'GET') return list(route);
    if (method === 'POST') return upload(route);
    const id = new URL(request.url()).pathname.split('/').at(-1) ?? '';
    const found = files.find((file) => file.id === id);
    if (found === undefined) {
      return respondError(
        route,
        HTTP.NOT_FOUND,
        API_ERROR_CODES.MEDIA_NOT_FOUND,
      );
    }
    return method === 'PATCH' ? update(route, found) : remove(route, found);
  });
}
