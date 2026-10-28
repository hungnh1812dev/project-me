import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as contentTypesFacade from '.';

const INDEX_FILE = resolve(import.meta.dirname, 'index.ts');
const EXPORT_LIST = /export\s+(?:type\s+)?\{([^}]+)\}/g;

function namesExportedBy(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(EXPORT_LIST)]
    .flatMap(([, names = '']) => names.split(','))
    .map((name) => name.trim())
    .filter(Boolean)
    .sort();
}

describe('content-types facade', () => {
  it('exposes exactly the content-type model and its loader', () => {
    expect(namesExportedBy(INDEX_FILE)).toEqual([
      'ContentType',
      'ContentTypeField',
      'getContentTypes',
    ]);
    expect(Object.keys(contentTypesFacade)).toEqual(['getContentTypes']);
  });
});
