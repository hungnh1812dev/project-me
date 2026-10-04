import { File as NodeFile } from 'node:buffer';

import { afterEach, beforeEach, vi } from 'vitest';

// jsdom's `FormData` and `File` cannot cross MSW's Node interceptors (the body parse throws), so a
// multipart upload never reaches a handler. Tests that send one swap in Node's own `FormData`
// (taken from a Node `Response`, since jsdom shadows the global) and build files with `uploadFile`.

const NodeFormData = (await new Response(new URLSearchParams('probe=1')).formData()).constructor;

/** Replaces the global `FormData` with Node's for each test in the calling file or `describe`. */
export function useNodeFormData(): void {
  beforeEach(() => {
    vi.stubGlobal('FormData', NodeFormData);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
}

/** A Node `File` that Node's `FormData` sends as a real file part. */
export function uploadFile(name: string, type: string, content = 'bytes'): File {
  return new NodeFile([content], name, { type }) as unknown as File;
}
