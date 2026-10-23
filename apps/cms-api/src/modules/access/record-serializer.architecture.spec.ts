import { join, sep } from 'node:path';

import {
  listSourceFiles,
  reachedFilesOf,
} from '../../architecture/import-graph';

/**
 * Architecture test for SPEC D3: `RecordSerializer` is the only path from a
 * loaded content record to a response. Static rules over `src/`, checked on
 * the files imports resolve to (facades are followed), not on path strings:
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
const GENERATED_DIR = 'generated';
const SERIALIZER_FILE = join('modules', 'access', 'record.serializer.ts');
/** Files that only use the record types to build the serializer itself. */
const SERIALIZER_BUILDING_BLOCKS = [
  SERIALIZER_FILE,
  join('modules', 'access', 'access.constants.ts'),
];

/**
 * Publish (T22) copies a draft into the published row inside one transaction.
 * The copied record is never part of a response (it returns `{ documentId,
 * version }`), so these files need no serializer. Bulk (T34) only inserts
 * trees through the repository and answers with ids and versions.
 */
const INTERNAL_COPY_FILES = [
  join('modules', 'documents', 'publish.service.ts'),
  join('modules', 'documents', 'tree-cloner.ts'),
  join('modules', 'documents', 'bulk.service.ts'),
];

const RECORD_LOADER_FILES = [
  join('modules', 'content-engine', 'content.repository.ts'),
  join('modules', 'content-engine', 'tree-loader.ts'),
];
const BOUNDARY_FILE = /\.(?:controller|filter|interceptor|gateway)\.ts$/;
const SERIALIZED_CAST = /\bas\s+SerializedRecord\b/;

const files = listSourceFiles(SRC_ROOT, { excludeDirs: [GENERATED_DIR] }).map(
  (source) => ({
    file: source.file,
    text: source.text,
    reached: reachedFilesOf(SRC_ROOT, source),
  }),
);

const importsRecordLoader = (reached: Set<string>) =>
  RECORD_LOADER_FILES.some((loader) => reached.has(loader));

describe('RecordSerializer is the only record -> response path', () => {
  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.some(({ file }) => file === SERIALIZER_FILE)).toBe(true);
    expect(
      RECORD_LOADER_FILES.every((loader) =>
        files.some(({ file }) => file === loader),
      ),
    ).toBe(true);
  });

  it('still finds real edges: the serializer reaches the record loaders', () => {
    const serializer = files.find(({ file }) => file === SERIALIZER_FILE);
    expect(
      serializer !== undefined && importsRecordLoader(serializer.reached),
    ).toBe(true);
  });

  it('record loaders are only used next to the serializer', () => {
    const offenders = files
      .filter(
        ({ file, reached }) =>
          !file.startsWith(CONTENT_ENGINE_DIR) &&
          !SERIALIZER_BUILDING_BLOCKS.includes(file) &&
          !INTERNAL_COPY_FILES.includes(file) &&
          importsRecordLoader(reached) &&
          !reached.has(SERIALIZER_FILE),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('HTTP boundary files never import record loaders', () => {
    const offenders = files
      .filter(
        ({ file, reached }) =>
          BOUNDARY_FILE.test(file) && importsRecordLoader(reached),
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
    expect(BOUNDARY_FILE.test('documents/documents.controller.ts')).toBe(true);
    expect(SERIALIZED_CAST.test('return body as SerializedRecord;')).toBe(true);
  });
});
