import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';

import {
  formatBytes,
  UPLOAD_ACCEPT,
  uploadErrorMessage,
  uploadSummary,
  validateUploadFile,
} from './media';

describe('validateUploadFile (AC-36)', () => {
  it.each([
    ['cat.png', 'image/png'],
    ['dog.jpg', 'image/jpeg'],
    ['bird.JPEG', 'image/jpeg'],
    ['Screen Shot.PNG', 'image/png'],
  ])('accepts %s (%s)', (name, type) => {
    expect(validateUploadFile({ name, type })).toBeNull();
  });

  it.each([
    ['anim.gif', 'image/gif'],
    ['notes.txt', 'text/plain'],
    ['fake.png', 'image/gif'],
    ['fake.gif', 'image/png'],
    ['no-extension', 'image/png'],
    ['cat.png', ''],
  ])('rejects %s (%s) with the supported-types message', (name, type) => {
    expect(validateUploadFile({ name, type })).toBe(
      `${name}: only PNG and JPEG images are supported.`,
    );
  });

  it('has no size limit (D7)', () => {
    expect(validateUploadFile({ name: 'huge.png', type: 'image/png', size: 1e10 })).toBeNull();
  });

  it('matches the file input accept list', () => {
    expect(UPLOAD_ACCEPT).toBe('image/png,image/jpeg');
  });
});

describe('formatBytes (AC-35)', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [20480, '20 KB'],
    [1536, '1.5 KB'],
    [1258291, '1.2 MB'],
    [5 * 1024 ** 3, '5 GB'],
    [3 * 1024 ** 4, '3072 GB'],
  ])('formats %d as %s', (bytes, label) => {
    expect(formatBytes(bytes)).toBe(label);
  });
});

describe('uploadErrorMessage (AC-37)', () => {
  it('says the file is too large on a 413 (D7)', () => {
    expect(uploadErrorMessage(new ApiError({ status: 413, message: 'Payload Too Large' }))).toBe(
      'File is too large.',
    );
  });

  it('says the type is unsupported on a 422', () => {
    expect(uploadErrorMessage(new ApiError({ status: 422, message: 'Unprocessable' }))).toBe(
      'Unsupported file type.',
    );
  });

  it.each([400, 500, 0])('uses the server message on a %d', (status) => {
    expect(uploadErrorMessage(new ApiError({ status, message: 'File is required' }))).toBe(
      'File is required',
    );
  });
});

describe('uploadSummary (AC-37)', () => {
  it.each([
    [2, 3, '2 of 3 files uploaded.'],
    [1, 1, '1 of 1 file uploaded.'],
    [0, 2, '0 of 2 files uploaded.'],
  ])('%d of %d → %s', (uploaded, total, text) => {
    expect(uploadSummary({ uploaded, total })).toBe(text);
  });
});
