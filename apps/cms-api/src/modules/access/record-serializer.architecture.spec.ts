import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Architecture test for SPEC D3: `RecordSerializer` is the only path from a
 * loaded content record to a response. Static rules over `src/`:
 *
 * 1. Outside the content engine, a file that imports the record loaders
 *    (`content.repository`, `tree-loader`) must also import
 *    `access/record.serializer`, so loaded records are serialized where
 *    they are read.
 * 2. HTTP boundary files (controllers, filters, interceptors, gateways)
 *    never import the record loaders: they only see serialized records.
 * 3. Only `record.serializer.ts` may cast to `SerializedRecord` (the brand
 *    that response types of document endpoints use).
 */

const SRC_ROOT = join(__dirname, '..', '..');
const CONTENT_ENGINE_DIR = join('modules', 'content-engine') + sep;
const GENERATED_DIR = 'generated' + sep;
const SERIALIZER_FILE = join('modules', 'access', 'record.serializer.ts');
/** Files that only use the record types to build the serializer itself. */
const SERIALIZER_BUILDING_BLOCKS = [
  SERIALIZER_FILE,
  join('modules', 'access', 'access.constants.ts'),
];

const RECORD_LOADER_IMPORT =
  /(?:from|import\()\s*['"][^'"]*content-engine\/(?:content\.repository|tree-loader)['"]/;
const SERIALIZER_IMPORT =
  /(?:from|import\()\s*['"][^'"]*access\/record\.serializer['"]|from\s*['"]\.\/record\.serializer['"]/;
const BOUNDARY_FILE = /\.(?:controller|filter|interceptor|gateway)\.ts$/;
const SERIALIZED_CAST = /\bas\s+SerializedRecord\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

const files = sourceFiles(SRC_ROOT)
  .map((path) => ({
    file: relative(SRC_ROOT, path),
    text: readFileSync(path, 'utf8'),
  }))
  .filter(({ file }) => !file.startsWith(GENERATED_DIR));

describe('RecordSerializer is the only record -> response path', () => {
  it('scans the source tree', () => {
    expect(files.some(({ file }) => file === SERIALIZER_FILE)).toBe(true);
  });

  it('record loaders are only used next to the serializer', () => {
    const offenders = files
      .filter(
        ({ file, text }) =>
          !file.startsWith(CONTENT_ENGINE_DIR) &&
          !SERIALIZER_BUILDING_BLOCKS.includes(file) &&
          RECORD_LOADER_IMPORT.test(text) &&
          !SERIALIZER_IMPORT.test(text),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('HTTP boundary files never import record loaders', () => {
    const offenders = files
      .filter(
        ({ file, text }) =>
          BOUNDARY_FILE.test(file) && RECORD_LOADER_IMPORT.test(text),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('only the serializer produces SerializedRecord', () => {
    const offenders = files
      .filter(
        ({ file, text }) =>
          file !== SERIALIZER_FILE && SERIALIZED_CAST.test(text),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('the rules match what they are meant to catch', () => {
    expect(
      RECORD_LOADER_IMPORT.test(
        "import { loadComponentTrees } from '../content-engine/tree-loader';",
      ),
    ).toBe(true);
    expect(
      RECORD_LOADER_IMPORT.test(
        "import type { ContentDocument } from '../content-engine/content.repository';",
      ),
    ).toBe(true);
    expect(
      SERIALIZER_IMPORT.test(
        "import { RecordSerializer } from '../access/record.serializer';",
      ),
    ).toBe(true);
    expect(BOUNDARY_FILE.test('documents/documents.controller.ts')).toBe(true);
    expect(SERIALIZED_CAST.test('return body as SerializedRecord;')).toBe(true);
  });
});
