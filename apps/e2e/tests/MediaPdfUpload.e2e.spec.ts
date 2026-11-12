import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { expect, test } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { HTTP } from '../src/E2e.constants';
import { bearer, ownerApiToken } from '../src/Session.fixture';

/**
 * Uploads one PDF as the owner through the API and saves the returned url, so
 * the production-like header check of a stored PDF can read it
 * (`test-results/media-pdf-url.txt`).
 */
const PDF_URL_FILE = 'test-results/media-pdf-url.txt';
const PDF_MIME = 'application/pdf';
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

test.describe('media pdf upload', { tag: ['@cms-api', '@media'] }, () => {
  test('the owner uploads a PDF and its url answers', async ({ request }) => {
    const token = await ownerApiToken(request);
    const response = await request.post(apiUrl(API_PATHS.MEDIA), {
      headers: bearer(token),
      multipart: { file: { name: 'e2e-header-check.pdf', mimeType: PDF_MIME, buffer: PDF_BYTES } },
    });
    expect(response.status()).toBe(HTTP.CREATED);
    const { url } = (await response.json()) as { url: string };
    const file = await request.get(url);
    expect(file.status()).toBe(HTTP.OK);
    expect(file.headers()['content-type']).toBe(PDF_MIME);
    mkdirSync(dirname(PDF_URL_FILE), { recursive: true });
    writeFileSync(PDF_URL_FILE, url);
  });
});
